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
var request = require('request');
var async = require('async');
var util = require('util');
var lutil = require('lutil');

// This lconfig stuff has to come before any other locker modules are loaded!!
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
    console.warn("Locker config already loaded, me is set to", lconfig.me);
}

var logger = require("logger").logger("lockerd");
logger.info('process id:' + process.pid);
var syncManager = require("syncManager.js");
var lcrypto = require("lcrypto");
var pipeline = require('pipeline');
var profileManager = require('profileManager');

if (process.argv.indexOf("offline") >= 0) syncManager.manager.offlineMode = true;

if (lconfig.lockerHost != "localhost" && lconfig.lockerHost != "127.0.0.1") {
    logger.warn('If I\'m running on a public IP, I need to have password protection,' + // uniquely self (de?)referential? lolz!
                'which if so inclined can be hacked into lockerd.js and added, since' +
                ' it\'s apparently still not implemented :)\n\n');
}
var shuttingDown_ = false;


// ordering sensitive, as synclet manager is inert during init, servicemanager's init will call into syncletmanager
// Dear lord this massive waterfall is so scary
syncManager.manager.init(function() {
  syncManager.manager.on("completed", function(response, task) {
    logger.info("Got a completion from %s", task.profile);
    pipeline.inject(response.data, function(err) {
      if(err) return logger.error("failed pipeline processing: "+err);
      logger.verbose("Reschduling " + JSON.stringify(task) + " and config "+JSON.stringify(response.config));
      // save any changes and reschedule
      var nextRun = response.config && response.config.nextRun;
      if(nextRun) delete response.config.nextRun; // don't want this getting stored!
      async.series([
        function(cb) { if(!response.auth) return cb(); profileManager.authSet(task.profile, response.auth, cb) },
        function(cb) { if(!response.config) return cb(); profileManager.configSet(task.profile, response.config, cb) },
        function() { syncManager.manager.schedule(task, nextRun) }
      ]);
    })
  });
  var webservice = require(__dirname + "/Ops/webservice.js");
  webservice.startService(lconfig.lockerPort, lconfig.lockerListenIP, function(locker) {
    // TODO we need to start up synclet processing for whatever set of users!
    if (lconfig.airbrakeKey) locker.initAirbrake(lconfig.airbrakeKey);
    exports.alive = true;
    require('ijod').initDB(function(err){ if(err) console.error(err); }); // just async for now
    require('accountsManager').init(function(){
      profileManager.init(postStartup);
    });
  });
});


// scheduling and misc things
function postStartup() {
    logger.info('hallway is up and running at ' + lconfig.lockerBase);
    exports.alive = true;
}

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
    shutdown(0);
});

process.on("SIGTERM", function() {
    shutdown(0);
});

if (!process.env.LOCKER_TEST) {
  process.on('uncaughtException', function(err) {
    try {
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
