var fs = require('fs')
  , path = require('path')
  , lconfig = require("lconfig")
  , spawn = require('child_process').spawn
  , IJOD = require('ijod').IJOD
  , async = require('async')
  , url = require('url')
  , lutil = require('lutil')
  , EventEmitter = require('events').EventEmitter
  , vm = require('vm')
  , util = require('util')
var logger = require("logger.js");
var levents = require("levents");
var dispatcher = require('instrument.js').StatsdDispatcher;
var stats = new dispatcher(lconfig.stats);

// Load these from a config
var PAGING_TIMING = 2000; // 2s gap in paging
var NUM_WORKERS = 4;

var runningContexts = {}; // Map of a synclet to a running context

function SyncletManager()
{
  EventEmitter.call(this);

  this.scheduled = {};
  this.offlineMode = false;
  var self = this;
  this.workQueue = async.queue(function(task, callback) { self.runAndReschedule(task, callback); }, NUM_WORKERS);
}
util.inherits(SyncletManager, EventEmitter);
SyncletManager.prototype.loadSynclets = function() {
  // not defensively coded! load synclets
  var self = this;

  function synclets(connector, dir) {
    logger.info("Loading the " + connector + " connector");
    if(!self.synclets[connector]) self.synclets[connector] = {};
    var srcdir = path.join(lconfig.lockerDir, "Connectors", dir);
    var sjs = JSON.parse(fs.readFileSync(path.join(srcdir, "synclets.json")));
    for(var i = 0; i < sjs.synclets.length; i++) {
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
* Task:
* {
*   synclet:{connector:"", name:""},
*   auth: {...},
*   config: {...},
*   user: "...opaque identifier..."
* }
*/
SyncletManager.prototype.schedule = function(task, timeToRun) {
  var key = this.getKey(task);
  // Let's get back to a clean slate on this synclet
  if (this.scheduled[key]) {
    logger.debug(key + " was already scheduled.");
    this.cleanup(task);
  }
  if (!this.synclets[task.synclet.connector] || !this.synclets[task.synclet.connector][task.synclet.name]) {
    logger.error("Attempted to schedule an unregistered synclet: " + task.synclet.connector + "-" + task.synclet.name);
    return;
  }
  var syncletInfo = this.synclets[task.synclet.connector][task.synclet.name];

  if (!syncletInfo.frequency) {
    logger.error("Attempted to schedule a run only synclet");
    return;
  }

  // In offline mode things may only be ran directly with runAndReschedule
  if (this.offlineMode) return;
 
  if (timeToRun === undefined) {
    // had a schedule and missed it, run it now
    /* TODO:  This whole logic block is either a higher level ore we need to save teh queue state on exit.
    if(syncletInfo.nextRun && syncletInfo.nextRun <= Date.now()) {
      logger.verbose("scheduling " + key + " to run immediately (missed)");
      timeToRun = 0;
    } else if (!syncletInfo.nextRun) {
    */
    // if not scheduled yet, schedule it to run in the future
    var milliFreq = parseInt(syncletInfo.frequency) * 1000;
    var nextRun = parseInt(Date.now() + milliFreq + (((Math.random() - 0.5) * 0.5) * milliFreq)); // 50% fuzz added or subtracted
    timeToRun = nextRun - Date.now();
    //}
  }

  logger.verbose("scheduling " + key + " (freq " + syncletInfo.frequency + "s) to run in " + (timeToRun / 1000) + "s");
  var self = this;
  this.scheduled[key] = setTimeout(function() { self.workQueue.push(task); }, timeToRun);
};
/// Remove the synclet from scheduled and cleanup all other state, does not reset it to run again
SyncletManager.prototype.cleanup = function(task) {
  var key = this.getKey(task);
  if (this.scheduled[key]) {
    clearTimeout(this.scheduled[key]); // remove any existing timer
    delete this.scheduled[key];
  }
};
/// Run the synclet and then attempt to reschedule it
SyncletManager.prototype.runAndReschedule = function(task, callback) {
  this.cleanup(task);
  var self = this;
  // Tolerance isn't done yet, we'll come back
  if (!this.checkToleranceReady(task)) {
    return self.schedule(task);
  }

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
  syncletInfo.sync(runInfo, function(syncErr, response) {
    if (syncErr) {
      logger.error(self.getKey(task) + " error: " + util.inspect(syncErr));
      return callback(syncErr);
    }
    var elapsed = Date.now() - tstart;
    /* TODO:  Temp disable since not individual now
    stats.increment('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.stop');
    stats.decrement('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.running');
    stats.timing('synclet.' + connectorInfo.id + '.' + syncletInfo.name + '.timing', elapsed);
    */
    logger.verbose("Synclet finished " + self.getKey(task) + " in " + elapsed + "ms");
    var nextRunTime = undefined;
    if (response.config && response.config.nextRun < 0) {
      // This wants to page so we'll schedule it for anther run in just a short gap.
      nextRunTime = PAGING_TIMING;
    }
    // Make sure we reschedule this before we return anything else
    self.schedule(task, nextRunTime);
    self.emit("completed", response, task);
    callback();
  });
};
/// Return true if the tolerance is ready for us to actually run
SyncletManager.prototype.checkToleranceReady = function(task) {
  // TODO:  What are we doing with tolerance now?  This might need to be stored on the config/state object of the task
  return true;

  // Make sure the baseline is there
  if (syncletInfo.tolMax === undefined) {
    syncletInfo.tolAt = 0;
    syncletInfo.tolMax = 0;
  }
  // if we can have tolerance, try again later
  if(syncletInfo.tolAt > 0) {
    syncletInfo.tolAt--;
    logger.verbose("tolerance now at " + syncletInfo.tolAt + " synclet " + syncletInfo.name + " for " + connectorInfo.id);
    return false;
  }
  return true;
};
// This trivial helper function just makes sure we're consistent and we can change it easly
SyncletManager.prototype.getKey = function(task) {
  return task.user + "-" + task.synclet.connector + "-" + task.synclet.name;
};

syncletManager = new SyncletManager();
syncletManager.loadSynclets();

exports.manager = syncletManager;

var ijods = {};

// core syncmanager init function, need to talk to serviceManager
var serviceManager;
exports.init = function (sman, callback) {
  serviceManager = sman;
  callback();
};

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
    if(post) {
      if(!Array.isArray(synclet.posts)) synclet.posts = [];
      synclet.posts.push(post);
    }
    var task = {
      config:js.config,
      auth:js.auth,
      synclet: {
        connector:js.id,
        name:synclet.name
      },
      user:"orig-locker-me"
    };
    syncletManager.runAndReschedule(task, cb);
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
      syncletManager.runAndReschedule(task, cb2);
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

function localError(base, err) {
    logger.error(base+"\t"+err);
}

function stuff()
{
    // TODO: Construct a result
    connectorInfo.status = syncletInfo.status = 'processing data';
    connectorInfo.auth = lutil.extend(true, connectorInfo.auth, response.auth); // for refresh tokens and profiles
    connectorInfo.config = lutil.extend(true, connectorInfo.config, response.config);
    serviceManager.mapDirty(connectorInfo.id); // save out to disk
    processResponse(deleteIDs, connectorInfo, syncletInfo, response, function(processErr) {
      connectorInfo.status = 'waiting';
      callback(processErr);
    });
}

function processResponse(deleteIDs, info, synclet, response, callback) {
    synclet.status = 'waiting';

    var dataKeys = [];
    if (typeof(response.data) === 'string') {
        return callback('bad data from synclet');
    }
    for (var i in response.data) {
        if(!Array.isArray(response.data[i])) continue;
        dataKeys.push(i);
    }
    for (var i in deleteIDs) {
        if (!dataKeys[i]) dataKeys.push(i);
    }
    synclet.deleted = synclet.added = synclet.updated = 0;
    async.forEach(dataKeys, function(key, cb) { processData(deleteIDs[key], info, synclet, key, response.data[key], cb); }, function(err){
        if(err) logger.error("err processing data: "+err);
        // here we roughly compromise a multiplier up or down based on the threshold being met
        var threshold = synclet.threshold || lconfig.tolerance.threshold;
        var total = synclet.deleted + synclet.added + synclet.updated;
        if (total < threshold)
        {
            if(synclet.tolMax < lconfig.tolerance.maxstep) synclet.tolMax++; // max 10x scheduled
            synclet.tolAt = synclet.tolMax;
        } else {
            if(synclet.tolMax > 0) synclet.tolMax--;
            synclet.tolAt = synclet.tolMax;
        }
        stats.increment('synclet.' + info.id + '.' + synclet.name + '.added',   synclet.added);
        stats.increment('synclet.' + info.id + '.' + synclet.name + '.updated', synclet.updated);
        stats.increment('synclet.' + info.id + '.' + synclet.name + '.deleted', synclet.deleted);
        stats.increment('synclet.' + info.id + '.' + synclet.name + '.length',  dataKeys.reduce(function(prev, cur, idx, arr) { return prev + response.data[cur].length; }, 0));
        logger.info("total of "+synclet.added+"+"+synclet.updated+"+"+synclet.deleted+" and threshold "+threshold+" so setting tolerance to "+synclet.tolMax);
        callback(err);
    });
}

// simple async friendly wrapper
function getIJOD(id, key, create, callback) {
    var name = path.join(lconfig.lockerDir, lconfig.me, id, key);
    //console.log("Open IJOD %s", name);
    if(ijods[name]) return callback(ijods[name]);
    // only load if one exists or create flag is set
    fs.stat(name+".db", function(err, stat){
        if(!stat && !create) return callback();
        var ij = new IJOD({name:name})
        ijods[name] = ij;
        ij.open(function(err){
            if(err) logger.error(err);
            return callback(ij);
        });
    });
}
exports.getIJOD = getIJOD;

function closeIJOD(id, key, callback) {
  var name = path.join(lconfig.lockerDir, lconfig.me, id, key);
  //console.log("Close IJOD %s", name);
  if (ijods[name]) {
    ijods[name].close(function(error) {
      delete ijods[name];
      callback();
    });
  } else {
    callback();
  }
}
exports.closeIJOD = closeIJOD;

function processData (deleteIDs, info, synclet, key, data, callback) {
    // this extra (handy) log breaks the synclet tests somehow??
    var len = (data)?data.length:0;
    var type = (info.types && info.types[key]) ? info.types[key] : key; // try to map the key to a generic data type for the idr
    var idr = lutil.idrNew(type, info.provider, undefined, key, info.id);
    if(len > 0) logger.info("processing synclet data from "+idr+" of length "+len);
    var collection = info.id + "_" + key;

    if (key.indexOf('/') !== -1) {
        console.error("DEPRECATED, dropping! "+key);
        return callback();
    }

    var mongoId;
    if (typeof info.mongoId === 'string') mongoId = info.mongoId;
    else if (info.mongoId) mongoId = info.mongoId[key + 's'] || info.mongoId[key] || 'id';
    else mongoId = 'id';

    getIJOD(info.id, key, true, function(ij){
      function finish(err) {
        closeIJOD(info.id, key, function() {
          return callback(err);
        });
      }
        if (deleteIDs && deleteIDs.length > 0 && data) {
            addData(collection, mongoId, data, info, synclet, idr, ij, function(err) {
                if(err) {
                    finish(err);
                } else {
                    deleteData(collection, mongoId, deleteIDs, info, synclet, idr, ij, finish);
                }
            });
        } else if (data && data.length > 0) {
          addData(collection, mongoId, data, info, synclet, idr, ij, function(err) {
            finish();
          });
        } else if (deleteIDs && deleteIDs.length > 0) {
            deleteData(collection, mongoId, deleteIDs, info, synclet, idr, ij, finish);
        } else {
            finish();
        }
    });
}

function deleteData (collection, mongoId, deleteIds, info, synclet, idr, ij, callback) {
    var q = async.queue(function(id, cb) {
        var r = url.parse(idr);
        r.hash = id.toString();
        levents.fireEvent(url.format(r), 'delete');
        synclet.deleted++;
        ij.delData({id:id}, cb);
    }, 5);
    // debug stuff
    var oldProcess = q.process;
    q.process = function() {
      var task = q.tasks[0];
      try {
        oldProcess();
      } catch (err) {
        console.error('ERROR: caught error while processing q on task ', task);
      }
    };
    deleteIds.forEach(q.push);
    q.drain = callback;
}

function addData (collection, mongoId, data, info, synclet, idr, ij, callback) {
  var errs = [];
  // Take out the deletes
  var deletes = data.filter(function(item) {
    var object = (item.obj) ? item : {obj: item};
    if (object.obj && object.type === "delete") {
      return true;
    }
    return false;
  });
  // TODO The deletes
  async.forEachSeries(deletes, function(item, cb) {
    var r = url.parse(idr);
    r.hash = object.obj[mongoId].toString();
    levents.fireEvent(url.format(r), 'delete');
    synclet.deleted++;
    ij.delData({id:object.obj[mongoId]}, cb);
  }, function(err) {
    // Now we'll batch process the rest as adds
    var entries = data.filter(function(item) {
      var object = (item.obj) ? item : {obj: item};
      if (object.obj && object.type === "delete") {
        return false;
      }
      return true; 
    });
    entries = entries.map(function(item) { 
      var object = (item.obj) ? item : {obj: item};
      return {id:object.obj[mongoId], data:object.obj};
    });
    ij.batchSmartAdd(entries, function() {
      // TODO:  Return some stats from batch add for added and updated
      entries.forEach(function(item) {
        var r = url.parse(idr);
        r.hash = item.toString();
        levents.fireEvent(url.format(r), "new", item.data);
      });
      callback();
    });
  });
}



