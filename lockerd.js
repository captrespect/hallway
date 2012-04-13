/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

exports.alive = false;


var spawn = require('child_process').spawn;
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

if (!path.existsSync(path.join(lconfig.lockerDir,lconfig.me))) fs.mkdirSync(path.join(lconfig.lockerDir, lconfig.me), 0755);

fs.writeFileSync(path.join(lconfig.lockerdir, 'Logs', 'locker.pid'), "" + process.pid);

var logger = require("logger");
logger.info('process id:' + process.pid);
var lscheduler = require("lscheduler");
var syncManager = require("syncManager.js");
var serviceManager = require("lservicemanager");
var pushManager = require(__dirname + "/Common/node/lpushmanager");
var lcrypto = require("lcrypto");
var pipeline = require('pipeline');
var profileManager = require('profileManager');

if (process.argv.indexOf("offline") >= 0) syncManager.setExecuteable(false);

if (lconfig.lockerHost != "localhost" && lconfig.lockerHost != "127.0.0.1") {
    logger.warn('If I\'m running on a public IP, I need to have password protection,' + // uniquely self (de?)referential? lolz!
                'which if so inclined can be hacked into lockerd.js and added, since' +
                ' it\'s apparently still not implemented :)\n\n');
}
var shuttingDown_ = false;

function checkKeys() {
    lcrypto.generateSymKey(function(hasKey) {
        if (!hasKey) {
            shutdown(1);
            return;
        }
        lcrypto.generatePKKeys(function(hasKeys) {
            if (!hasKeys) {
                shutdown(1);
                return;
            }
            runMigrations("preServices", finishStartup);
        });
    });
}

function finishStartup() {
    pushManager.init();

    // ordering sensitive, as synclet manager is inert during init, servicemanager's init will call into syncletmanager
    // Dear lord this massive waterfall is so scary
    syncManager.manager.init(serviceManager, function() {
      syncManager.manager.on("completed", function(response, task) {
        pipeline.incoming({data:response.data, owner:task.user}, function(err){
          if(err) return logger.error("failed pipeline processing: "+err);
          logger.verbose("Reschduling " + JSON.stringify(task));
          // save any changes and reschedule
          async.series([
            function(cb) { if(!response.auth) return cb(); profileManager.authSet(task.profile, response.auth, cb) },
            function(cb) { if(!response.config) return cb(); profileManager.configSet(task.profile, response.config, cb) },
            function() { syncManager.manager.schedule(task) }
          ]);
        })
      });
      var webservice = require(__dirname + "/Ops/webservice.js");
      webservice.startService(lconfig.lockerPort, lconfig.lockerListenIP, function(locker) {
        // TODO we need to start up synclet processing for whatever set of users!
        if (lconfig.airbrakeKey) locker.initAirbrake(lconfig.airbrakeKey);
        exports.alive = true;
        require('accountsManager').init(function(){
          profileManager.init(postStartup);
        });
      });
    });
    var lockerPortNext = "1"+lconfig.lockerPort;
    lockerPortNext++;
}

var origVer;
function runMigrations(phase, migrationCB) {
    var migrations = [];
    var metaData = {version: 0};
    try {
        migrations = fs.readdirSync(path.join(lconfig.lockerDir, "/migrations"));
        metaData = JSON.parse(fs.readFileSync(path.join(lconfig.lockerDir, lconfig.me, "state.json")));
    } catch (E) {}
    if(!origVer) origVer = metaData.version; // persist this across phases on startup

    if (migrations.length > 0) migrations = migrations.sort(); // do in order, so versions are saved properly

    if (!metaData.version && phase == "preServices") {
        metaData.version = Number(migrations[migrations.length - 1].substring(0, 13));
        lutil.atomicWriteFileSync(path.join(lconfig.lockerDir, lconfig.me, "state.json"), JSON.stringify(metaData, null, 4));
        return migrationCB();
    }

    async.forEachSeries(migrations, function(migration, cb) {
        if (Number(migration.substring(0, 13)) <= origVer) return cb();

        try {
            migrate = require(path.join(lconfig.lockerDir, "migrations", migration))[phase];
            if(typeof migrate !== 'function') return cb();
            logger.info("running global migration : " + migration + ' for phase ' + phase);
            migrate(lconfig, function(ret) {
                if (!ret) {
                    logger.error("failed to run global migration!");
                    return shutdown(1);
                }
                metaData.version = Number(migration.substring(0, 13));
                lutil.atomicWriteFileSync(path.join(lconfig.lockerDir, lconfig.me, "state.json"), JSON.stringify(metaData, null, 4));
                logger.info("Migration complete for: " + migration);
                cb();

                /*
                // XXX: These are synchronous only right now, until we can find a less destructive way to do post startup
                // if they returned a string, it's a post-startup callback!
                if (typeof ret == 'string')
                {
                    serviceMap.migrations.push(lconfig.lockerBase+"/Me/"+metaData.id+"/"+ret);
                }
                */
            });
        } catch (E) {
            // TODO: do we need to exit here?!?
            logger.error("error running global migration : " + migration + " ---- " + E);
            shutdown(1);
        }
    }, migrationCB);
}

// scheduling and misc things
function postStartup() {
    lscheduler.masterScheduler.loadAndStart();
    logger.info('locker is up and running at ' + lconfig.lockerBase);
    exports.alive = true;
    runMigrations("postStartup", function() {});
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
    serviceManager.shutdown(function () {
      if (callback) {
        return callback(returnCode);
      }
      else {
        return exit(returnCode);
      }
    });
}

function exit(returnCode) {
    logger.info("Shutdown complete", {}, function (err, level, msg, meta) {
        process.exit(returnCode);
    });
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

checkKeys();
// Export some things so this can be used by other processes, mainly for the test runner
exports.shutdown = shutdown;
