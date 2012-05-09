var fs = require('fs');
var path = require('path');
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require("logger.js").logger("syncManager");
var profileManager = require('profileManager');
var dal = require("dal");

// Load these from a config
var PAGING_TIMING = 2000; // 2s gap in paging
var NUM_WORKERS = 4;
var DEFAULT_SCAN_TIME = 5000;

// TODO TECH-DEBT: the task object might be pointless now, need to rethink it some

var syncletManager;

exports.debug = false;

/** 
* The database has a state field for the SyncSchedule table.  This field represents 
* where the task is in the process of being ran.  The states are:
*
* 0 - Pending a run, normal waiting
* 1 - The task has been added to the local async work queue
* 2 - The task is currently executing in the synclet
* 3 - The task has finished and is awaiting processing and reschedule
*/
function SyncletManager()
{
  EventEmitter.call(this);

  this.scheduled = {};
  this.offlineMode = false;
}
util.inherits(SyncletManager, EventEmitter);
// Async init
SyncletManager.prototype.init = function(liveWorker, callback) {
  var self = this;

  self.liveWorker = liveWorker;

  dal.query("CREATE TABLE IF NOT EXISTS SyncSchedule (`key` VARCHAR(255) PRIMARY KEY, worker VARCHAR(255), nextRun BIGINT UNSIGNED, state INT, task TEXT, errorCount INT NOT NULL, lastError VARCHAR(255))", [], function(error) {
    if(error) logger.error("Create error: %s", error);
    self.loadSynclets();
    if (self.offlineMode) {
      return callback();
    }
    // If we're not a worker and just talking to workers, we can bail early
    if (!self.liveWorker) return callback();

    self.workerName = require("os").hostname();;

    this.scanTimeout = undefined;
    self.workQueue = async.queue(function(task, callback) { self.runTask(task, callback); }, NUM_WORKERS);
    self.workQueue.drain = function() { self.scanAndRun(); };
    /*
    var sql = "SELECT task FROM SyncSchedule WHERE state != 0 AND worker=?";
    var binds = [self.workerName];
    dal.query(sql, binds, function(error, rows) {
      if (error) {
        logger.error("Task catch up error: %s", error);
        return callback(new Error(error));
      }
      rows.forEach(function(row) {
        self.workQueue.push(JSON.parse(row.task));
      });
    });
    */
    self.scanAndRun();
    logger.info("SyncManager is up and running.");
    callback();
  });
};
SyncletManager.prototype.loadSynclets = function() {
  // not defensively coded! load synclets
  var self = this;

  function synclets(service) {
    logger.info("Loading the " + service + " service");
    if (!self.synclets[service]) self.synclets[service] = {};
    var sjs = self.services[service] = JSON.parse(fs.readFileSync(path.join(__dirname, 'services', service, 'synclets.json')));
    for (var i = 0; i < sjs.synclets.length; i++) {
      var sname = sjs.synclets[i].name;
      var spath = path.join("services", service, sname);
      delete require.cache[spath]; // remove any old one
      self.synclets[service][sname] = {
        frequency:sjs.synclets[i].frequency,
        sync:require(spath).sync
      };
      logger.info("\t* " + sname);
    }
  }
  // TODO from config
  this.synclets = {};
  this.services = {};
  synclets('twitter');
  synclets('facebook');
  synclets('instagram');
  synclets('foursquare');
};

// just return the list of services as loaded from disk
SyncletManager.prototype.getServices = function(callback) {
  callback(null, this.services);
}

/// Schedule a synclet to run
/**
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
SyncletManager.prototype.schedule = function(task, timeToRun) {
  if (exports.debug) logger.debug("scheduling "+JSON.stringify(task)+" at "+timeToRun);
  if (!this.synclets[task.synclet.connector] || !this.synclets[task.synclet.connector][task.synclet.name]) {
    logger.error("Attempted to schedule an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name);
    return;
  }
  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];

  if (!syncletInfo.frequency) {
    logger.error("Attempted to schedule a run only synclet");
    return;
  }

  // In offline mode things may only be ran directly with runTask
  if (this.offlineMode) return;

  var self = this;
  var key = this.getKey(task);
  var sql = "SELECT * FROM SyncSchedule WHERE `key`=? AND state > 0 AND worker != NULL";

  dal.query(sql, [self.getKey(task)], function(error, rows) {
    if (error) {
      logger.error("Error trying to find a key in the schdule: " + error);
      return;
    }

    if (rows && rows.length == 1 && rows[0].state !== 0 && rows[0].state !== 3) {
      logger.error("Attempted to reschedule a synclet while it is running");
      return;
    }

    if (timeToRun === undefined || timeToRun === null || timeToRun <= 0) {
      // We'll default to frequency unless paging
      var nextRun = (timeToRun < 0) ? PAGING_TIMING : parseInt(syncletInfo.frequency, 10) * 1000;
      // if not scheduled yet, schedule it to run in the future
      if (exports.debug) logger.debug("Making a fresh timetoRun from now");
      timeToRun = Date.now() + nextRun;
    }

    logger.info("scheduling " + key + " (freq " + syncletInfo.frequency + "s) to run in " + ((timeToRun - Date.now()) / 1000) + "s");
    dal.query("INSERT INTO SyncSchedule (`key`, worker, nextRun, state, task) VALUES(?, NULL, ?, 0, ?) ON DUPLICATE KEY UPDATE nextRun=VALUES(nextRun),task=VALUES(task),state=0", [key, timeToRun, JSON.stringify(task)], function(error) {
      if (error) {
        logger.error("Failed to schedule " + key);
        // TODO
      }
      if (self.liveWorker) self.scanAndRun();
    });
  });
};
SyncletManager.prototype.updateState = function(key, state, cb) {
  var sql = "UPDATE SyncSchedule SET state=? WHERE `key`=?";
  var binds = [state, key];
  dal.query(sql, binds, cb);
};
SyncletManager.prototype.scanAndRun = function() {
  if (!this.liveWorker) {
    logger.error("scanAndRun was called when not in live worker mode.");
    return;
  }

  if (this.scanTimeout) {
    clearTimeout(this.scanTimeout);
    this.scanTimeout = undefined;
  }
  var self = this;
  function setNextScan(timeout) {
    if (timeout < 0) timeout = DEFAULT_SCAN_TIME;
    self.scanTimeout = setTimeout(function() { self.scanAndRun(); }, timeout || DEFAULT_SCAN_TIME);
  }
  var ranRows = 0;
  var sql = "UPDATE SyncSchedule SET worker=? WHERE nextRun <= UNIX_TIMESTAMP()*1000 AND state=0 AND worker IS NULL ORDER BY nextRun LIMIT 4";
  dal.query(sql, [self.workerName], function(error, rows) {
    if (error) {
      logger.error(error);
    };
    sql = "SELECT * FROM SyncSchedule WHERE worker=? AND state=0"; 
    dal.query(sql, [self.workerName], function(error, rows) {
      if (error) {
        logger.error("There was an error trying to scanAndRun",error);
        return setNextScan();
      }
      async.forEach(rows, function(row, cb) {
        ++ranRows;
        self.updateState(row.key, 1, function(error) {
          if (error) {
            logger.error("There was an error updating the state on " + row.key);
          }
          self.workQueue.push(JSON.parse(row.task));
          cb();
        });
      }, function(error) {
        // If we ran some rows, drain will reschedule us
        if (ranRows > 0) return;
        dal.query("SELECT MIN(nextRun) AS nextRun FROM SyncSchedule WHERE worker=? AND state=0", [self.workerName], function(error, rows) {
          if (error) {
            logger.error("Error getting a nextRun time: " + error);
            return setNextScan();
          }
          var scanTimeout = undefined;
          if (rows.length == 1 && rows[0].nextRun) scanTimeout = rows[0].nextRun - Date.now();
          if (exports.debug) logger.debug("Setting next run timeout to %d - %j", scanTimeout, rows[0]);
          setNextScan(scanTimeout);
        });
      });
    });
  });
};
/// force an already scheduled task to run asap
SyncletManager.prototype.syncNow = function(key, cb) {
  if (cb === undefined) cb = function() {};
  // Unless we're a worker we never do this
  if (!this.liveWorker) return cb();
  var sql = "UPDATE SyncSchedule SET nextRun = 0 WHERE `key`=? AND worker IS NULL";
  var binds = [key];
  dal.query(sql, binds, function(err) {
    syncletManager.scanAndRun();
    cb(err ? err : null);
  });
};
/// Run the synclet and then attempt to reschedule it
SyncletManager.prototype.runTask = function(task, callback) {
  var self = this;

  if (!this.liveWorker) return callback("Not in a livemode");

  function cbDone(err, response)
  {
    if (err) logger.error(self.getKey(task) + " sync error: " + util.inspect(err));
    var elapsed = Date.now() - tstart;
    logger.verbose("Synclet finished " + self.getKey(task) + " in " + elapsed + "ms");
    // flag it's done, then send it out and be done
    self.updateState(self.getKey(task), 3, function(error) {
      if (!err) {
        dal.query("UPDATE SyncSchedule SET worker=NULL,errorCount=0,lastError=NULL WHERE `key`=?", [self.getKey(task)], function(error) {
          self.emit("completed", response, task);
        });
      } else {
        dal.query("UPDATE SyncSchedule SET errorCount=errorCount+1, lastError=? WHERE `key`=?", [err.toString().substr(0, 255), self.getKey(task)], function(error) {
          self.schedule(task);
        });
      }
      callback(err);
    });    
  }
  // Don't reschdule, it's never going to work, drop it and assume they will reschedule
  if (!this.synclets[task.synclet.connector] || !this.synclets[task.synclet.connector][task.synclet.name]) {
    logger.error("Attempted to run an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name);
    return;
  }

  logger.verbose("Synclet starting " + this.getKey(task));
  var tstart = Date.now();

  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];
  var runInfo = {};
  var self = this;
  // load up the current auth/config data and prep to run a task
  async.series([
    function(cb) { profileManager.allGet(task.profile, function(err, ret){ runInfo = ret; cb(); }); },
    function(cb) { self.updateState(self.getKey(task), 2, cb); },
    function() {
      if(!runInfo.auth) {
        logger.error("no auth found, skipping "+JSON.stringify(task));
        return callback(new Error("no auth found, skipping"));
      }
      if(!runInfo.config) runInfo.config = {};
      // in case something in the synclet barfs... 
      try {
        syncletInfo.sync(runInfo, cbDone);
      } catch(E) {
        cbDone(E); // this should never be a double-callback!
      }
    }
  ]);
};
// This trivial helper function just makes sure we're consistent and we can change it easly
SyncletManager.prototype.getKey = function(task) {
  return task.profile + "/" + task.synclet.name;
};

syncletManager = new SyncletManager();
exports.manager = syncletManager;

// create the synclet tasks for a given service and auth
exports.initService = function (service, auth, callback, syncletId) {
  var synclets = syncletManager.synclets[service];
  if (!synclets) return callback("no synclets like that installed");
  async.forEachSeries(Object.keys(synclets), function (name, cb) {
    var synclet = synclets[name];
    // If they requested a specific synclet we'll skip everything but that one
    if(syncletId && name != syncletId) return cb();
    // TODO, should we merge with any existing matching task's config?
    // may need multiple auth's someday (different keys/permissions)
    var task = {
      synclet: {
        connector:service,
        name:name
      },
      profile:auth.pid
    };
    // this will save it async, and ask it to run immediately
    syncletManager.schedule(task, Date.now());
    cb();
  }, callback);
};

// Have a service run all of its synclets now
exports.flushService = function (service, pid, callback) {
  var synclets = syncletManager.synclets[service];
  if (!synclets) return callback("no synclets like that installed");
  async.forEachSeries(Object.keys(synclets), function (name, cb) {
    logger.debug("Resetting synclet %s/%s", service, name);
    var task = {
      synclet: {
        connector:service,
        name:name
      },
      profile:pid
    };
    syncletManager.syncNow(syncletManager.getKey(task), cb);
  }, callback);
};
