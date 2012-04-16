var fs = require('fs');
var path = require('path');
var lconfig = require("lconfig");
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var logger = require("logger.js");
var levents = require("levents");
var mysql = require('mysql');
var profileManager = require('profileManager');
var dispatcher = require('instrument.js').StatsdDispatcher;
var stats = new dispatcher(lconfig.stats);

// Load these from a config
var PAGING_TIMING = 2000; // 2s gap in paging
var NUM_WORKERS = 4;
var DEFAULT_SCAN_TIME = 10000;

// TODO TECH-DEBT: the task object might be pointless now, need to rethink it some

var syncletManager;

/** 
* The database has a state field for the SyncSchedule table.  This field represents 
* where the task is in the process of being ran.  The states are:
*
* 0 - Pending a run, normal waiting
* 1 - The task has been added to the local async work queue
* 2 - The task is currently executing in the synclet
*/
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
  var self = this;
  self.db.query("CREATE TABLE IF NOT EXISTS SyncSchedule (`key` VARCHAR(255) PRIMARY KEY, worker VARCHAR(255), nextRun BIGINT UNSIGNED, state INT, task TEXT)", function(error) {
    self.loadSynclets();
    if (self.offlineMode) return callback();
    var sql = "SELECT task FROM SyncSchedule WHERE state != 0 AND worker=?";
    var binds = [lconfig.workerName];
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
  synclets('instagram');
  synclets('foursquare');
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
  logger.info("scheduling "+JSON.stringify(task)+" at "+timeToRun);
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

    if (rows && rows.length == 1 && rows[0].state !== 0 && rows[0].state !== 3) {
      logger.error("Attempted to reschedule a synclet while it is running");
      return;
    }

    if (timeToRun === undefined || timeToRun <= 0) {
      // We'll default to frequency unless paging
      var nextRun = (timeToRun < 0) ? PAGING_TIMING : parseInt(syncletInfo.frequency, 10) * 1000;
      // if not scheduled yet, schedule it to run in the future
      timeToRun = Date.now() + nextRun;
    }

    logger.verbose("scheduling " + key + " (freq " + syncletInfo.frequency + "s) to run in " + ((timeToRun - Date.now()) / 1000) + "s");
    self.db.query("REPLACE INTO SyncSchedule VALUES(?, ?, ?, 0, ?)", [key, lconfig.workerName, timeToRun, JSON.stringify(task)], function(error) {
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
  var sql = "SELECT * FROM SyncSchedule WHERE nextRun <= ? AND state=0 AND worker=?";
  var binds = [Date.now(), lconfig.workerName];
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
/// force an already scheduled task to run asap
SyncletManager.prototype.syncNow = function(key, cb) {
  if (cb === undefined) cb = function() {};
  var sql = "UPDATE SyncSchedule SET nextRun = 0 WHERE `key`=? AND worker=?";
  var binds = [key, lconfig.workerName];
  this.db.query(sql, binds, function(err) {
    if(err) return cb(err);
    syncletManager.scanAndRun();
    cb();
  });
};
/// Run the synclet and then attempt to reschedule it
SyncletManager.prototype.runTask = function(task, callback) {
  var self = this;

  function cbDone(err, response)
  {
    if (err) logger.error(self.getKey(task) + " sync error: " + util.inspect(err));
    var elapsed = Date.now() - tstart;
    logger.verbose("Synclet finished " + self.getKey(task) + " in " + elapsed + "ms");
    // flag it's done, then send it out and be done
    self.updateState(self.getKey(task), 3, function(error) {
      if (!err) self.emit("completed", response, task);
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
    console.error("initializing "+service+" synclet "+name+" for "+auth.pid);
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
