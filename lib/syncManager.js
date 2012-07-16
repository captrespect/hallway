var fs = require('fs');
var path = require('path');
var async = require('async');
var lconfig = require('lconfig');
var util = require('util');
var logger = require('logger').logger('syncManager');
var profileManager = require('profileManager');
var dal = require('dal');
var Skew = require('skew').client;
var instruments = require('instruments');

var NUM_WORKERS = lconfig.syncManager.numWorkers || 4;
var PAGING_TIMING = lconfig.syncManager.pagingTiming || 2000;
var DEFAULT_SCAN_TIME = lconfig.syncManager.defaultScanTime || 5000;

var syncletManager;

exports.debug = false;

function errorHelper(text, callback) {
  var E = new Error(text);

  logger.error(E);

  return callback(E);
}

/**
* The state field represents where the task is in the process of being ran.
*
* The states are:
*
* 0 - Pending a run, normal waiting
* 1 - The task has been added to the local async work queue
* 2 - The task is currently executing in the synclet
* 3 - The task has finished and is awaiting processing and reschedule
*/

function SyncletManager() {
  this.scheduled = {};
  this.offlineMode = false;

  // This is overridden in hallwayd.js when the syncManager is instantiated
  this.completed = function() {
    // This shouldn't happen
    logger.error("Default syncManager.completed callback called");
  };
}

// Async init
SyncletManager.prototype.init = function(liveWorker, callback) {
  var self = this;

  if (!lconfig.syncManager.redis || !lconfig.syncManager.beanstalk) {
    logger.error('lconfig.syncManager.redis, lconfig.syncManager.beanstalk ' +
      'are required, exiting');

    process.exit(1);
  }

  self.liveWorker = liveWorker;

  self.loadSynclets();

  // If we're not a worker and just talking to workers, we can bail early
  if (self.offlineMode || !self.liveWorker) {
    return callback();
  }

  self.scanTimeout = undefined;
  self.active = {};
  self.last = [];
  self.total = 0;

  self.workQueue = async.queue(function(task, callback) {
    // TODO: Could we just use the task's key here?
    var key = Math.random().toString(16).substr(2);

    self.active[key] = task;

    self.runTask(task, function() {
      delete self.active[key];

      task.tdone = Date.now();

      var duration = task.tdone - task.tstart;

      // Log the duration of the synclet by its connector and name
      var stats = {};
      stats["synclet.duration.rollup"] = duration;
      stats["synclet.duration." + task.synclet.connector + ".rollup"] = duration;
      stats["synclet.duration." + task.synclet.connector + "." + task.synclet.name] = duration;
      instruments.timing(stats).send();

      // Log at 60 seconds
      if (duration > 60000) {
        logger.info("Synclet " + task.synclet.connector + "#" + task.synclet.name +
          " took > 60s to complete: " + Math.round(duration / 1000) + "s");
      }

      // keep the last 100 tasks around for admin
      self.last.unshift(task);

      self.last = self.last.slice(0, 100);

      callback();
    });
  }, NUM_WORKERS);

  self.workQueue.drain = function() {
    if (self.stopping)
      return self.stopping();

    if (exports.debug)
      logger.info("workQueue.drain occurred");

    self.getJobs();
  };

  self.skew = new Skew(lconfig.syncManager, self.workerName);

  async.series([
    function(cb) {
      // Clean up any jobs that our worker was responsible for
      self.skew.clearWorkerJobs(function(err, clearedJobs) {
        if (err) {
          return cb(err);
        }

        if (clearedJobs > 0) {
          logger.info("Cleared " + clearedJobs + " stale jobs for " + self.workerName);
        }

        cb();
      });
    },
    function(cb) {
      // Backfill the queue if this is the first time it is run
      self.backfillQueue(function(err) {
        cb(err);
      });
    }
  ], function(err) {
    if (err) {
      logger.error("Error while starting up", err);

      process.exit(1);
    }

    logger.info("SyncManager is up and running for " + self.workerName);

    self.getJobs(true);

    callback();
  });
};

SyncletManager.prototype.backfillQueue = function(callback) {
  var self = this;

  self.skew.isFilled(function(err, filled) {
    if (filled) {
      return callback();
    }

    // Acquire the fill lock so more than one worker doesn't begin backfilling
    self.skew.getFillLock(function(err, gotLock) {
      if (err || !gotLock) {
        logger.debug('Failed to get the fill lock: ' + err);

        return callback(err);
      }

      logger.info('Performing first-run backfill of the job queue');

      var offset = 0;
      var rowCount;

      var PAGE_SIZE = 100;

      // Iterate through all of the profiles
      async.until(
        function() {
          return rowCount === 0;
        },
        function(untilCallback) {
          var sql = "SELECT id, service, auth, config, cat FROM Profiles ORDER BY id, cat LIMIT " + PAGE_SIZE + " OFFSET " + offset;

          offset += PAGE_SIZE;

          dal.query(sql, [], function(err, rows) {
            rowCount = rows.length;

            if (exports.debug)
              logger.debug('Scheduling ' + rows.length + ' profiles...');

            rows.forEach(function(row) {
              if (row.auth === null) {
                logger.debug('Skipped profile with no auth: ' + row.id + ', ' + row.service);

                return;
              }

              row.auth = JSON.parse(row.auth);

              exports.initService(row.service, row.auth, function() {});
            });

            untilCallback(err);
          });
        },
        function(err) {
          // Release the fill lock
          self.skew.releaseFillLock(function(err) {
            callback(err);
          });
        }
      );
    });
  });
};

SyncletManager.prototype.stop = function(stopCB) {
  if (this.workQueue.length() === 0)
    return stopCB();

  logger.info("Waiting for current work to finish.");

  this.stopping = stopCB;
};

// admin things used by worker web service
SyncletManager.prototype.backlog = function() {
  return this.workQueue.length();
};

SyncletManager.prototype.actives = function() {
  var ret = [];
  var self = this;

  Object.keys(self.active).forEach(function(key) {
    ret.push(self.active[key]);
  });

  return ret;
};

SyncletManager.prototype.lasts = function() {
  return this.last;
};

SyncletManager.prototype.totals = function() {
  return this.total;
};

SyncletManager.prototype.loadSynclets = function() {
  // not defensively coded! load synclets
  var self = this;

  function synclets(service) {
    logger.info("Loading the " + service + " service");

    if (!self.synclets[service])
      self.synclets[service] = {};

    var sjs = self.services[service] = JSON.parse(fs.readFileSync(path.join(__dirname, 'services', service, 'synclets.json')));

    for (var i = 0; i < sjs.synclets.length; i++) {
      var sname = sjs.synclets[i].name;
      var spath = path.join("services", service, sname);

      delete require.cache[spath]; // remove any old one

      self.synclets[service][sname] = {
        frequency: sjs.synclets[i].frequency,
        sync: require(spath).sync
      };

      logger.info("\t* " + sname);
    }
  }

  this.synclets = {};
  this.services = {};

  // TODO: Load synclets from lconfig
  synclets('twitter');
  synclets('facebook');
  synclets('instagram');
  synclets('foursquare');
  synclets('tumblr');
  synclets('linkedin');
  synclets('fitbit');
  synclets('gcontacts');
  synclets('github');
  synclets('wordpress');
  synclets('runkeeper');
  synclets('dropbox');
  synclets('google');
//  synclets('meetup');
  synclets('gmail');
  synclets('yammer');
};

// Just return the list of services as loaded from disk
SyncletManager.prototype.getServices = function(callback) {
  callback(null, this.services);
};

/*
 * Schedule a synclet to run
 * timeToRun is optional.  In this case the next run time is calculated
 * based on normal frequency and tolerance methods.
 * Task: {
 *   synclet:{connector:"", name:""},
 *   auth: {...},
 *   config: {...},
 *   user: "...opaque identifier..."
 * }
 *
 * timeToRun:  milliseconds from epoch to run the task
 */
SyncletManager.prototype.schedule = function(task, timeToRun, cbDone) {
  if (!cbDone)
    cbDone = function() {};

  if (!this.synclets[task.synclet.connector] ||
    !this.synclets[task.synclet.connector][task.synclet.name]) {
    return errorHelper("Attempted to schedule an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name, cbDone);
  }

  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];

  if (!syncletInfo.frequency) {
    return errorHelper("Attempted to schedule a run only synclet", cbDone);
  }

  // In offline mode things may only be ran directly with runTask
  if (this.offlineMode)
    return cbDone();

  var self = this;
  var key = self.getKey(task);

  self.skew.isJobRunning(self.getKey(task), function(err, running) {
    if (err) {
      return errorHelper("Error trying to see if job was scheduled: " + err, cbDone);
    }

    if (running) {
      return errorHelper("Attempted to reschedule a synclet while it's running", cbDone);
    }

    if (timeToRun === undefined || timeToRun === null || timeToRun <= 0) {
      // We'll default to frequency unless paging
      var nextRun = (timeToRun < 0) ? PAGING_TIMING : parseInt(syncletInfo.frequency, 10) * 1000;

      // If not scheduled yet, schedule it to run in the future
      if (exports.debug)
        logger.debug("Making a fresh timetoRun from now");

      timeToRun = Date.now() + nextRun;
    }

    logger.info("Scheduling " + key + " (ƒ " + syncletInfo.frequency + "s) to run in " + Math.round(((timeToRun - Date.now()) / 1000) * 100) / 100 + "s");

    self.skew.schedule(key, timeToRun, task, 500, function(err, jobId) {
      if (err || !jobId) {
        return errorHelper("Failed to schedule '" + key + "', err: " + err, cbDone);
      }

      logger.info("Scheduled " + key + " as job ID '" + jobId + "'");

      if (self.liveWorker)
        self.getJobs();

      cbDone();
    });
  });
};

SyncletManager.prototype.getJobs = function(forceStart) {
  var self = this;

  if (exports.debug)
    logger.debug('Entered getJobs() loop');

  if (!self.liveWorker)
    return logger.error("getJobs was called when not in live worker mode.");

  if (self.scanTimeout) {
    clearTimeout(self.scanTimeout);

    self.scanTimeout = undefined;
  } else if (!forceStart) {
    // We bail here so that we can't double up
    return;
  }

  function setNextScan(timeout) {
    if (timeout < 0)
      timeout = DEFAULT_SCAN_TIME;

    self.scanTimeout = setTimeout(function() { self.getJobs(); }, timeout || DEFAULT_SCAN_TIME);
  }

  var ranRows = 0;

  async.whilst(
    function() {
      // We want to maintain a queue equal to the size of NUM_WORKERS
      var capacity = (NUM_WORKERS * 2) - self.workQueue.length();

      return capacity > 0 && !self.stopping;
    },
    function(callback) {
      self.skew.reserve(function(err, jobId, task) {
        if (err || !jobId || !task) {
          logger.error("Error reserving a job: " + err);

          return callback(err);
        }

        self.skew.updateState(self.getKey(task), 1, function(err) {
          if (err) {
            logger.error("Error updating the state on " + self.getKey(task), err);

            return callback();
          }

          task.jobId = jobId;
          task.state = 1;

          ranRows++;

          self.workQueue.push(task);

          callback();
        });
      });
    },
    function(err) {
      setNextScan();

      logger.info('Exited getJobs() after queuing ' + ranRows + ' jobs');
    }
  );
};

// Run the synclet
SyncletManager.prototype.runTask = function(task, callback) {
  var self = this;
  var runInfo = {};

  if (!this.liveWorker)
    return callback("Not a live worker");

  if (this.stopping) {
    self.skew.release(self.getKey(task), task.jobId, task.priority, 0, function(err) {
      callback(err);
    });

    return;
  }

  var tstart = task.tstart = Date.now();

  function cbDone(err, response) {
    if (err)
      logger.warn(self.getKey(task) + " sync error: " + util.inspect(err).replace(/\s+/g, " "));

    var elapsed = Date.now() - tstart;

    logger.verbose("Synclet finished " + self.getKey(task) + " in " + elapsed + "ms");

    // flag it's done, then send it out and be done
    task.state = 3;
    task.tpipe = Date.now();
    task.count = 0;

    // ugly but counts the total items being processed for admin/debug
    if (response && typeof response.data == 'object') {
      Object.keys(response.data).forEach(function(key) {
        if (Array.isArray(response.data[key])) {
          task.count += response.data[key].length;
        }
      });
    }

    self.total += task.count;

    self.skew.updateState(self.getKey(task), 3, function(updateError) {
      if (task.count > 0 || !err) {
        var stats = {};

        stats["synclet.items.services.rollup"] = task.count;
        stats["synclet.items.services." + task.synclet.connector + ".rollup"] = task.count;
        stats["synclet.items.services." + task.synclet.connector + "." + task.synclet.name] = task.count;

        instruments.modify(stats).send();

        instruments.increment("synclet.successful").send();

        self.skew.destroy(task.jobId, function(err) {
          if (destroyErr) {
            logger.error("Error destroying job '" + task.jobId + "' after successful sync: " + destroyErr);

            logger.debug("Synclet successful, removed job '" + task.jobId + "' from beanstalkd");
          }

          self.completed(response, task, callback);
        });
      } else {
        instruments.increment("synclet.error." + task.synclet.connector + "." + task.synclet.name).send();

        var errString = (typeof err == 'string') ? err : util.inspect(err).replace(/\s+/g, " ");

        logger.error("Sync failed: " + self.getKey(task) + ", " + errString.substr(0, 255));

        self.skew.destroy(self.getKey(task), task.jobId, function(destroyErr) {
          if (destroyErr) {
            logger.error("Error destroying job '" + task.jobId + "' after sync failure: " + destroyErr);
          }

          // Reschedule the job since we've failed
          self.schedule(task);

          callback(err);
        });
      }
    });
  }

  // Don't reschdule, it's never going to work, drop it and assume they will reschedule
  if (!this.synclets[task.synclet.connector] ||
    !this.synclets[task.synclet.connector][task.synclet.name]) {
    return errorHelper("Attempted to run an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name, callback);
  }

  logger.verbose("Synclet starting " + this.getKey(task));

  delete task.tpipe;
  delete task.tdone;
  delete task.count;

  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];

  // load up the current auth/config data and prep to run a task
  async.series([
    function(cb) {
      profileManager.allGet(task.profile, function(err, ret) {
        runInfo = ret;

        cb();
      });
    },
    function(cb) {
      task.state = 2;

      self.skew.updateState(self.getKey(task), 2, cb);
    }
  ], function() {
    if (!runInfo.auth) {
      return errorHelper("No auth found, skipping: " + JSON.stringify(task), callback);
    }

    if (!runInfo.config)
      runInfo.config = {};

    instruments.increment("synclet.run").send();

    // In case something in the synclet barfs...
    try {
      syncletInfo.sync(runInfo, cbDone);
    } catch(E) {
      cbDone(E); // this should never be a double-callback!
    }
  });
};

// This trivial helper function just makes sure we're consistent and we can
// change it easily
SyncletManager.prototype.getKey = function(task) {
  return task.profile + "/" + task.synclet.name;
};

syncletManager = new SyncletManager();

exports.manager = syncletManager;

// Create the synclet tasks for a given service and auth
exports.initService = function(service, auth, callback, syncletId) {
  var synclets = syncletManager.synclets[service];

  if (!synclets)
    return callback("No synclets like that installed");

  async.forEachSeries(Object.keys(synclets), function(name, cb) {
    var synclet = synclets[name];

    // If they requested a specific synclet we'll skip everything but that one
    if (syncletId && name != syncletId)
      return cb();

    // TODO, should we merge with any existing matching task's config?
    // may need multiple auth's someday (different keys/permissions)
    var task = {
      synclet: {
        connector: service,
        name: name
      },
      profile: auth.pid
    };

    // this will save it async, and ask it to run immediately
    syncletManager.schedule(task, Date.now());

    cb();
  }, callback);
};

// TODO: Reimplement this
//// Force an already scheduled task to run ASAP
//SyncletManager.prototype.syncNow = function(key, cb) {
//  if (cb === undefined) cb = function() {};
//
//  // Unless we're a worker we never do this
//  if (!this.liveWorker)
//    return cb();
//
//  var sql = "UPDATE SyncSchedule SET nextRun = 0 WHERE `key`=? AND worker IS NULL";
//  var binds = [key];
//
//  dal.query(sql, binds, function(err) {
//    syncletManager.getJobs();
//
//    cb(err ? err : null);
//  });
//};

// TODO: Reimplement this
//// Have a service run all of its synclets now
//exports.flushService = function(service, pid, callback) {
//  var synclets = syncletManager.synclets[service];
//
//  if (!synclets)
//    return callback("no synclets like that installed");
//
//  async.forEachSeries(Object.keys(synclets), function(name, cb) {
//    logger.debug("Resetting synclet %s/%s", service, name);
//
//    var task = {
//      synclet: {
//        connector: service,
//        name: name
//      },
//      profile: pid
//    };
//
//    syncletManager.syncNow(syncletManager.getKey(task), cb);
//  }, callback);
//};
