var fs = require('fs');
var path = require('path');
var lconfig = require("lconfig");
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require("logger.js");
var levents = require("levents");
var sqlite = require("sqlite-fts");
var mysql = require("mysql");
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
  this.db = mysql.createClient({
    host:lconfig.database.hostname, 
    user:lconfig.database.username,
    password:lconfig.database.password,
    database:lconfig.database.database
  });
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
  self.db.query("CREATE TABLE IF NOT EXISTS SyncSchedule (`key` VARCHAR(255) PRIMARY KEY, worker VARCHAR(255), nextRun BIGINT UNSIGNED, state INT, task TEXT)", function(error) {
    self.loadSynclets();
    var sql = "SELECT task FROM SyncSchedule WHERE state != 0";
    var binds = [];
    if (lconfig.workerName) {
      sql += " AND worker=?";
      binds.push(lconfig.workerName);
    }
    var res = self.db.query(sql, binds);
    res.on("error", function(error) {
      logger.error("There was an error finding missed synclets: " + error);
    });
    res.on("row", function(row) {
      self.workQueue.push(JSON.parse(row.task));
    });
    res.on("end", function() {
      self.scanAndRun();
      callback();
    });
  });
};
SyncletManager.prototype.loadSynclets = function() {
  // not defensively coded! load synclets
  var self = this;

  function synclets(connector) {
    logger.info("Loading the " + connector + " connector");
    if (!self.synclets[connector]) self.synclets[connector] = {};
    var srcdir = path.join(lconfig.lockerDir, "Connectors", connector);
    var sjs = JSON.parse(fs.readFileSync(path.join(srcdir, "synclets.json")));
    for (var i = 0; i < sjs.synclets.length; i++) {
      var sname = sjs.synclets[i].name;
      var spath = path.join(lconfig.lockerDir, "Connectors", connector, sname);
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
  synclets('twitter');
  synclets('facebook');
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
  var sql = "SELECT * FROM SyncSchedule WHERE `key`=?";
  var binds = [key];
  if (lconfig.workerName) {
    sql += " AND worker=?";
    binds.push(lconfig.workerName);
  }
  this.db.query(sql, binds, function(error, rows) {
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
      if (task.config && task.config.nextRun && task.config.nextRun < 0) {
        // Paging
        nextRun = PAGING_TIMING;
      }
      // if not scheduled yet, schedule it to run in the future
      timeToRun = Date.now() + nextRun;
    }

    logger.verbose("scheduling " + key + " (freq " + syncletInfo.frequency + "s) to run in " + ((timeToRun - Date.now()) / 1000) + "s");
    self.db.query("REPLACE INTO SyncSchedule VALUES(?, ?, ?, 0, ?)", [key, (lconfig.workerName || null), timeToRun, JSON.stringify(task)], function(error) {
      if (error) {
        logger.error("Failed to schedule " + key);
        // TODO
      }
      self.scanAndRun();
    });
  });
};
SyncletManager.prototype.updateState = function(key, state, cb) {
  var sql = "UPDATE SyncSchedule SET state=? WHERE `key`=?";
  var binds = [state, key];
  if (lconfig.workerName) {
    sql += " AND worker=?";
    binds.push(lconfig.workerName);
  }
  this.db.query(sql, binds, cb);
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
  var sql = "SELECT * FROM SyncSchedule WHERE nextRun <= ? AND state=0";
  var binds = [Date.now()];
  if (lconfig.workerName) {
    sql += " AND worker=?";
    binds.push(lconfig.workerName);
  }
  var res = this.db.query(sql, binds);
  res.on("error", function(error) {
    console.error("There was an error trying to scanAndRun: " + error);
    return setNextScan();
  });
  res.on("row", function(row) {
    ++ranRows;
    self.updateState(row.key, 1, function(error) {
      if (error) {
        logger.error("There was an error updating the state on " + row.key);
      }
      self.workQueue.push(JSON.parse(row.task));
    });
  });
  res.on("end", function() {
    // If we ran some rows, drain will reschedule us
    if (ranRows > 0) return;
    self.db.query("SELECT MIN(nextRun) AS nextRun FROM SyncSchedule", function(error, rows) {
      if (error) {
        logger.error("Error getting a nextRun time: " + error);
        return setNextScan();
      }
      setNextScan((rows.length == 1 && rows[0].nextRun) ? rows[0].nextRun : undefined);
    });
  });
};
/// Remove the synclet from scheduled and cleanup all other state, does not reset it to run again
SyncletManager.prototype.cleanup = function(task, cb) {
  if (cb === undefined) cb = function() {};
  var sql = "DELETE FROM SyncSchedule WHERE `key`=?";
  var binds = [this.getKey(task)];
  if (lconfig.workerName) {
    sql += " AND worker=?";
    binds.push(lconfig.workerName);
  }
  this.db.query(sql, binds, cb);
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
  this.updateState(this.getKey(task), 2, function(error) {
    if (error) {
      logger.error("There was an error updating " + this.getKey(task) + " to the running state");
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
      self.cleanup(task, function(error) {
        if (!syncErr) self.emit("completed", response, task);
        callback(syncErr);
      });
    });
  });
};
// This trivial helper function just makes sure we're consistent and we can change it easly
SyncletManager.prototype.getKey = function(task) {
  return task.profile + "/" + task.synclet.name;
};

syncletManager = new SyncletManager();
exports.manager = syncletManager;

var executeable = true;
exports.setExecuteable = function (e) {
    executeable = e;
};

// Run a connector or a specific synclet right now
exports.syncNow = function (service, auth, callback, syncletId) {
  var synclets = syncletManager.synclets[service];
  if (!synclets) return callback("no synclets like that installed");
  async.forEachSeries(Object.keys(synclets), function (name, cb) {
    var synclet = synclets[name];
    // If they requested a specific synclet we'll skip everything but that one
    console.error("initializing "+service+" synclet "+name+" for "+auth.pid);
    if(syncletId && name != syncletId) return cb();
    var task = {
      config:{},
      auth:auth,
      synclet: {
        connector:service,
        name:name
      },
      profile:auth.pid
    };
    syncletManager.runTask(task, cb);
  }, callback);
};
