/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

exports.alive = false;

var fs = require('fs');
var path = require('path');
var async = require('async');
var util = require('util');
var argv = require("optimist").argv;

var Roles = {
  worker: {
    startup:startWorkerWS
  },
  apihost: {
    startup:startAPIHost
  },
  dawg: {
    startup:startDawg
  },
  stream: {
    startup:startStream
  }
};
var role = Roles.apihost;

// This lconfig stuff has to come before any other hallway modules are loaded!
var lconfig = require('lconfig');
var configDir = process.env.LOCKER_CONFIG || 'Config';
if (!lconfig.loaded) {
    var configFile;
    if (process.argv[2] === '--config') {
        configFile = process.argv[3];
    }
    else {
        configFile = path.join(configDir, 'config.json');
    }
    lconfig.load(configFile);
}
else {
    console.warn("Hallway config already loaded");
}

var logger = require("logger").logger("hallwayd");
logger.info('process id:' + process.pid);
var alerting = require("alerting");
lconfig.alerting = {key:1}
if (lconfig.alerting && lconfig.alerting.key) {
  alerting.init(lconfig.alerting);
  alerting.install(function(E) {
    logger.error("Uncaught exception: %s", E.message);
    shutdown(1);
  });
}
var syncManager = require("syncManager.js");
var pipeline = require('pipeline');
var profileManager = require('profileManager');
// Set our globalAgent sockets higher
var http = require("http");
http.globalAgent.maxSockets = 800;

if (process.argv.indexOf("offline") >= 0) syncManager.manager.offlineMode = true;

var shuttingDown_ = false;

function syncComplete(response, task, runInfo, callback) {
  logger.info("Got a completion from %s", task.profile);
  if(!response) logger.debug("missing response");
  if(!response) response = {};
  pipeline.inject(response.data, runInfo.auth, function(err) {
    if(err) return logger.error("failed pipeline processing: "+err);
    logger.verbose("Rescheduling " + JSON.stringify(task) + " and config "+JSON.stringify(response.config));
    // save any changes and reschedule
    var nextRun = response.config && response.config.nextRun;
    if(nextRun) delete response.config.nextRun; // don't want this getting stored!
    async.series([
      function(cb) { if(!response.auth) return cb(); profileManager.authSet(task.profile, response.auth, null, cb) },
      function(cb) { if(!response.config) return cb(); profileManager.configSet(task.profile, response.config, cb) },
      function(cb) { syncManager.manager.schedule(task, nextRun, cb); },
    ], callback);
  })
}

function startSyncmanager(cbDone) {
  var isWorker = (role === Roles.worker);
  if (isWorker) {
    syncManager.manager.completed = syncComplete;
    logger.info("Starting a worker.");
  }
  syncManager.manager.init(isWorker, function() {
    cbDone();
  });
}

function startAPIHost(cbDone) {
  logger.info("Starting an API host");
  var webservice = require('webservice');
  webservice.startService(lconfig.lockerPort, lconfig.lockerListenIP, function(hallway) {
    logger.info('Hallway is now listening at ' + lconfig.lockerBase);
    cbDone();
  });
}

function startDawg(cbDone) {
  if (!lconfig.dawg || !lconfig.dawg.port || !lconfig.dawg.password) {
    logger.error("You must specify a dawg section with at least a port and password to run.");
    shutdown(1);
  }
  logger.info("Starting a Hallway Dawg -- Think you can get away without having a hall pass?  Think again.");
  var dawg = require("dawg");
  if (!lconfig.dawg.listenIP) lconfig.dawg.listenIP = "0.0.0.0";
  dawg.startService(lconfig.dawg.port, lconfig.dawg.listenIP, function() {
    logger.info("The Dawg is now monitoring at port %d", lconfig.dawg.port);
    cbDone();
  });
}

function startStream(cbDone) {
  logger.info("Starting a Hallway Stream -- you're in for a good time.");
  require("streamer").startService(lconfig.stream, function() {
    logger.info("Streaming at port %d", lconfig.stream.port);
    cbDone();
  });
}

function startWorkerWS(cbDone) {
  if (!lconfig.worker || !lconfig.worker.port) {
    logger.error("You must specify a worker section with at least a port and password to run.");
    shutdown(1);
  }
  var worker = require("worker");
  if (!lconfig.worker.listenIP) lconfig.worker.listenIP = "0.0.0.0";
  worker.startService(syncManager.manager, lconfig.worker.port, lconfig.worker.listenIP, function() {
    logger.info("Starting a Hallway Worker, thou shalt be digitized", lconfig.worker);
    cbDone();
  });
}

if (argv._.length > 0) {
  if (!Roles.hasOwnProperty(argv._[0])) {
    logger.error("The %s role is unknown.", argv._[0]);
    return shutdown(1);
  }
  role = Roles[argv._[0]];
}

var startupTasks = [];

startupTasks.push(require('ijod').initDB);

if (role !== Roles.dawg && role !== Roles.stream) {
  startupTasks.push(startSyncmanager);
  startupTasks.push(require('acl').init);
  startupTasks.push(profileManager.init);
}

if (role.startup) {
  startupTasks.push(role.startup);
}

async.series(startupTasks, function(error) {
  // TODO:  This needs a cleanup, it's too async
  logger.info("Hallway is up and running.");
  exports.alive = true;
});

// scheduling and misc things
function shutdown(returnCode, callback) {
    if (shuttingDown_ && returnCode !== 0) {
        try {
            console.error("Aieee! Shutdown called while already shutting down! Panicking!");
        }
        catch (e) {
            // we tried...
        }
        process.exit(1);
    }
    shuttingDown_ = true;
    process.stdout.write("\n");
    logger.info("Shutting down...");
    if (callback) {
      return callback(returnCode);
    }
    else {
      return exit(returnCode);
    }
}

function exit(returnCode) {
  logger.info("Shutdown complete");
  process.exit(returnCode);
}

process.on("SIGINT", function() {
  logger.info("Shutting down via SIGINT...");
  switch (role) {
  case Roles.worker:
    syncManager.manager.stop(function() {
      shutdown(0);
    });
    break;
  case Roles.apihost:
  default:
    shutdown(0);
    break;
  };
});

process.on("SIGTERM", function() {
  logger.info("Shutting down via SIGTERM...");
  shutdown(0);
});

if (!process.env.LOCKER_TEST) {
  process.on('uncaughtException', function(err) {
    try {
      if(err.toString().indexOf('Error: Parse Error') >= 0)
      {
        // ignoring this for now, relating to some node bug, https://github.com/joyent/node/issues/2997
        logger.warn(err);
        return;
      }
      if(err.toString().indexOf('ECONNRESET') >= 0 || err.toString().indexOf('socket hang up') >= 0)
      {
        // THEORY: these bubble up from event emitter as uncaught errors, even though the socket end event still fires and are ignorable
        logger.warn(err);
        return;
      }
      logger.error('Uncaught exception:');
      logger.error(util.inspect(err));
      if (err && err.stack) logger.error(util.inspect(err.stack));
      if (lconfig.airbrakeKey) {
        var airbrake = require('airbrake').createClient(lconfig.airbrakeKey);
        airbrake.notify(err, function(err, url) {
          if (url) logger.error(url);
          shutdown(1);
        });
      } else {
        shutdown(1);
      }
    } catch (e) {
      try {
        console.error("Caught an exception while handling an uncaught exception!");
        console.error(e);
      } catch (e) {
        // we tried...
      }
      process.exit(1);
    }
  });
}

// Export some things so this can be used by other processes, mainly for the test runner
exports.shutdown = shutdown;
