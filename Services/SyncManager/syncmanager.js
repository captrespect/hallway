var fs = require('fs');
var path = require('path');
var lconfig = require("lconfig");
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require("logger.js");
var levents = require("levents");
var sqlite = require("sqlite-fts");
var dispatcher = require('instrument.js').StatsdDispatcher;
var stats = new dispatcher(lconfig.stats);

// Load these from a config
var PAGING_TIMING = 2000; // 2s gap in paging
var NUM_WORKERS = 4;
var DEFAULT_SCAN_TIME = 10000;

var serviceManager;
var syncletManager;

function SyncletManager()
{
  EventEmitter.call(this);

  this.scheduled = {};
  this.offlineMode = false;
  this.db = new sqlite.Database();
  this.scanTimeout = undefined;
  var self = this;
  this.workQueue = async.queue(function(task, callback) { self.runTask(task, callback); }, NUM_WORKERS);
  this.workQueue.drain = function() { self.scanAndRun(); };
}
util.inherits(SyncletManager, EventEmitter);
// Async init
SyncletManager.prototype.init = function(sman, callback) {
  serviceManager = sman;
  var self = this;
  // TODO:  Change this path to something more generic or larger
  this.db.open(path.join(lconfig.lockerDir, lconfig.me, "syncSchedule.db"), function(error) {
    if (error) {
      // TODO:  This is fatal right now, but needs to be handled better
      throw new Error("Could not open the schedule database for the SyncletManager");
    }
    self.db.execute("CREATE TABLE IF NOT EXISTS SyncSchedule (key STRING PRIMARY KEY, nextRun INTEGER, task STRING, state INTEGER)", function(error, rows) {
      self.loadSynclets();
      self.db.query("SELECT task FROM SyncSchedule WHERE state != 0", function(error, row) {
        if (error) {
          logger.error("There was an error finding missed synclets: " + error);
        }
        if (row === undefined) {
          // TODO:  Here check for synclets that are not in state 0 and rerun them, they were busted or missed
          callback();
        } else {
          self.workQueue.push(JSON.parse(row.task));
        }
      });
    });
  });
};
SyncletManager.prototype.loadSynclets = function() {
  // not defensively coded! load synclets
  var self = this;

  function synclets(connector, dir) {
    logger.info("Loading the " + connector + " connector");
    if (!self.synclets[connector]) self.synclets[connector] = {};
    var srcdir = path.join(lconfig.lockerDir, "Connectors", dir);
    var sjs = JSON.parse(fs.readFileSync(path.join(srcdir, "synclets.json")));
    for (var i = 0; i < sjs.synclets.length; i++) {
      var sname = sjs.synclets[i].name;
      var spath = path.join(lconfig.lockerDir, "Connectors", dir, sname);
      delete require.cache[spath]; // remove any old one
      self.synclets[connector][sname] = {
        frequency:sjs.synclets[i].frequency,
        srcdir:srcdir,
        sync:require(spath).sync
      };
      logger.info("\t* " + sname);
    }
  }
  // TODO from config
  this.synclets = {};
  synclets('twitter','Twitter');
  synclets('facebook','Facebook');
};
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
  this.db.execute("SELECT * FROM SyncSchedule WHERE key=?", [key], function(error,rows) {
    if (error) {
      logger.error("Error trying to find a key in the schdule: " + error);
      return;
    }

    if (rows && rows.length == 1 && rows[0].state !== 0) {
      logger.error("Attempted to reschedule a synclet while it is running");
      return;
    }

    if (timeToRun === undefined) {
      // We'll default to frequency unless paging
      var nextRun = parseInt(syncletInfo.frequency, 10) * 1000;
      if (task.config && task.config.nextRun < 0) {
        // Paging
        nextRun = PAGING_TIMING;
      }
      // if not scheduled yet, schedule it to run in the future
      timeToRun = Date.now() + nextRun;
    }

    logger.verbose("scheduling " + key + " (freq " + syncletInfo.frequency + "s) to run in " + ((Date.now() - timeToRun) / 1000) + "s");
    self.db.execute("REPLACE INTO SyncSchedule VALUES(?, ?, ?, 0)", [key, timeToRun, JSON.stringify(task)], function(error) {
      if (error) {
        logger.error("Failed to schedule " + key);
        // TODO
      }
      self.scanAndRun();
    });
  });
};
SyncletManager.prototype.scanAndRun = function() {
  if (this.scanTimeout) {
    clearTimeout(this.scanTimeout);
    this.scanTimeout = undefined;
  }
  var self = this;
  function setNextScan(timeout) {
    self.scanTimeout = setTimeout(function() { self.scanAndRun(); }, timeout || DEFAULT_SCAN_TIME);
  }
  var ranRows = 0;
  this.db.query("SELECT * FROM SyncSchedule WHERE nextRun <= ? AND state=0", [Date.now()], function(error, row) {
    if (error) {
      console.error("There was an error trying to scanAndRun: " + error);
      return setNextScan();
    }
    if (row === undefined) {
      // If we ran some rows, drain will reschedule us
      if (ranRows > 0) return;
      self.db.execute("SELECT MIN(nextRun) AS nextRun FROM SyncSchedule", function(error, rows) {
        if (error) {
          logger.error("Error getting a nextRun time: " + error);
          return setNextScan();
        }
        setNextScan((rows.length == 1 && rows[0].nextRun) ? rows[0].nextRun : undefined);
      });
    } else {
      ++ranRows;
      self.db.execute("UPDATE SyncSchedule SET state=1 WHERE key=?", [row.key], function(error) {
        if (error) {
          logger.error("There was an error updating the state on " + row.key);
        }
        self.workQueue.push(JSON.parse(row.task));
      });
    }
  });
};
/// Remove the synclet from scheduled and cleanup all other state, does not reset it to run again
SyncletManager.prototype.cleanup = function(task, cb) {
  if (cb === undefined) cb = function() {};
  this.db.execute("DELETE FROM SyncSchedule WHERE key=?", [this.getKey(task)], cb);
};
/// Run the synclet and then attempt to reschedule it
SyncletManager.prototype.runTask = function(task, callback) {
  var self = this;

  // Don't reschdule, it's never going to work, drop it and assume they will reschedule
  // once authed.
  if(!task.auth) {
    logger.error("Tried to run an unauthed synclet!");
    return callback("no auth info for " + task.synclet.connector + "-" + task.synclet.name);
  }

  if (!this.synclets[task.synclet.connector] || !this.synclets[task.synclet.connector][task.synclet.name]) {
    logger.error("Attempted to run an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name);
    return;
  }

  logger.verbose("Synclet starting " + this.getKey(task));
  var tstart = Date.now();
  /* TODO:  Temp disabled since not individual now
  stats.increment('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.start');
  stats.increment('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.running');
  */

  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];
  var runInfo = {
    config:(task.config || {}),
    auth:task.auth,
    absoluteSrcdir:syncletInfo.srcdir
  };
  this.db.execute("UPDATE SyncSchedule SET state=2 WHERE key=?", [this.getKey(task)], function(error) {
    if (error) {
      logger.error("There was an error updating " + key + " to the running state");
    }

    syncletInfo.sync(runInfo, function(syncErr, response) {
      if (syncErr) {
        logger.error(self.getKey(task) + " error: " + util.inspect(syncErr));
      }
      var elapsed = Date.now() - tstart;
      /* TODO:  Temp disable since not individual now
      stats.increment('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.stop');
      stats.decrement('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.running');
      stats.timing('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.timing', elapsed);
      */
      logger.verbose("Synclet finished " + self.getKey(task) + " in " + elapsed + "ms");
      // TODO:  We could analyze the response a bit and apply tolerance to nextRun
      self.cleanup(task, function() {
        if (!syncErr) self.emit("completed", response, task);
        callback(syncErr);
      });
    });
  });
};
// This trivial helper function just makes sure we're consistent and we can change it easly
SyncletManager.prototype.getKey = function(task) {
  return task.user + "-" + task.synclet.connector + "-" + task.synclet.name;
};

syncletManager = new SyncletManager();
exports.manager = syncletManager;

var executeable = true;
exports.setExecuteable = function (e) {
    executeable = e;
};

// Run a connector or a specific synclet right now
exports.syncNow = function (serviceId, syncletId, post, callback) {
  if(typeof syncletId == "function") {
    callback = syncletId;
    syncletId = false;
  }

  var js = serviceManager.map(serviceId);
  if (!js || !js.synclets) return callback("no synclets like that installed");
  async.forEachSeries(js.synclets, function (synclet, cb) {
    if (!synclet) {
      logger.error("Unknown synclet info in syncNow");
      return cb();
    }
    // If they requested a specific synclet we'll skip everything but that one
    if(syncletId && synclet.name != syncletId) return cb();
    var task = {
      config:js.config,
      auth:js.auth,
      synclet: {
        connector:js.id,
        name:synclet.name
      },
      user:"orig-locker-me"
    };
    syncletManager.runTask(task, cb);
  }, callback);
};

// run all synclets that have a tolerance and reset them
// TODO:  Remove or massively refactor this, just a shim while testing
exports.flushTolerance = function(callback, force) {
  // TODO:  This now has an implied force, is that correct, why wouldn't you want this to force?
  var map = serviceManager.map();
  async.forEach(Object.keys(map), function(service, cb){ // do all services in parallel
    // We only want services with synclets
    if(!map[service].synclets) return cb();
    async.forEachSeries(map[service].synclets, function(synclet, cb2) { // do each synclet in series
      // TODO:  Figure out tolerance
      //synclet.tolAt = 0;
      var task = {
        config:map[service].config,
        auth:map[service].auth,
        synclet: {
          connector:map[service].id,
          name:synclet.name
        },
        user:"orig-locker-me"
      };
      syncletManager.runTask(task, cb2);
    }, cb);
  }, callback);
};

// Shims the old single user locker data to run in the new task mode
exports.scheduleAll = function(callback) {
  var map = serviceManager.map();
  async.forEach(Object.keys(map), function(service, cb){ // do all services in parallel
    // We only want services with synclets
    if(!map[service].synclets) return cb();
    async.forEach(map[service].synclets, function(synclet, cb2) { // do each synclet in series
      var task = {
        config:map[service].config,
        auth:map[service].auth,
        synclet: {
          connector:map[service].id,
          name:synclet.name
        },
        user:"orig-locker-me"
      };
      syncletManager.schedule(task);
      cb2();
    }, cb);
  }, callback);
};

