/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

//just a place for lockerd.js to populate config info
var fs = require('fs');
var path = require('path');

exports.load = function(filepath) {
  if (exports.loaded) return;

  // allow overriding
  var configPath = filepath;
  if (process.env.LOCKER_CONFIG) {
    console.error('env override set, config path is', process.env.LOCKER_CONFIG);
    configPath = path.join(process.env.LOCKER_CONFIG, 'config.json');
  }

  var config = {};
  if (path.existsSync(configPath))
    config = JSON.parse(fs.readFileSync(configPath));

  exports.debug = config.debug || false;
  exports.lockerHost = config.lockerHost || 'localhost';
  exports.externalHost = config.externalHost || 'localhost';
  exports.lockerListenIP = config.lockerListenIP || '0.0.0.0';

  exports.lockerPort = config.lockerPort;
  if (exports.lockerPort === 0) {
    exports.lockerPort = 8042 + Math.floor(Math.random()*100);
  } else if (!exports.lockerPort) {
    exports.lockerPort = 8042;
  }

  if(config.externalPort)
    exports.externalPort = config.externalPort;
  else if(config.externalSecure)
    exports.externalPort = 443;
  else
    exports.externalPort = exports.lockerPort;
  exports.externalSecure = config.externalSecure;
  exports.registryUpdate = config.hasOwnProperty('registryUpdate') ? config.registryUpdate : true;
  exports.requireSigned = config.hasOwnProperty('requireSigned') ? config.requireSigned : true;
  exports.externalPath = config.externalPath || '';
  exports.memcache = config.memcache;
  exports.statsd = config.statsd;
  exports.dawg = config.dawg || { host: 'http://localhost:8050', password: 'test-password', port: 8050 };
  exports.stream = config.stream || { apihost: 'http://localhost:8042', streamhost: 'http://localhost:8069', port: 8069, listenIP:"0.0.0.0" };
  exports.worker = config.worker;
  if(!exports.worker) exports.worker = {port:8041};
  exports.stats = config.stats || {};
  exports.database = config.database || {};
  if(!exports.database.port) exports.database.port = 3306;
  if(!exports.database.maxConnections) exports.database.maxConnections = 10;
  exports.alerting = config.alerting;
  exports.ec2 = config.ec2 || { accessKeyId: 'x', secretKey: 'x' };
  exports.s3 = config.s3 || {key:"x", secret:"X", bucket:"X"};
  exports.syncManager = config.syncManager || { redis: { host: 'localhost', port: 6379 }, beanstalk: { host: 'localhost', port: 11300 } };
  exports.authSecrets = config.authSecrets || {crypt:'foo', sign:'bar'}; // these need to be required to be set in prod, trusted cookies use them during auth
  exports.cookieExpire = config.cookieExpire || (60 * 60 * 24 * 30); // default 30 days
  if (exports.stats.prefix) {
    var hostname = process.env.HOSTNAME
    , hostBasename;

    if (!hostname) hostBasename = 'localhost';
    else hostBasename = hostname.split('.')[0];

    exports.stats.prefix += '.' + hostBasename;
  }
  //TODO this should only happen once
  setFromEnvs();
  setBase();
  exports.registryUpdateInterval = config.registryUpdateInterval || 3600;

  // FIXME: me should get resolved into an absolute path, but much of the code base uses it relatively.
  //
  // allow overriding (for testing)
  if (process.env.LOCKER_ME) {
    console.error('env override set, Me path is', process.env.LOCKER_ME);
    exports.me = process.env.LOCKER_ME;
  }
  else if (config.me) {
    exports.me = config.me;
  }
  else {
    exports.me = 'Me';
  }

  var configDir = process.env.LOCKER_CONFIG || 'Config';
  if (path.existsSync(path.join(configDir, 'apikeys.json'))) {
    exports.apikeysPath = path.join(configDir, 'apikeys.json');
  }

  if(!config.logging) config.logging = {};
  exports.logging =  {
    file: config.logging.file || undefined,
    level:config.logging.level || "verbose",
    maxsize: config.logging.maxsize || 256 * 1024 * 1024, // default max log file size of 64MBB
    console: (config.logging.hasOwnProperty('console')? config.logging.console : true)
  };
  if(!config.tolerance) config.tolerance = {};
  exports.tolerance =  {
    threshold: config.tolerance.threshold || 50, // how many new/updated items
    maxstep: config.tolerance.maxstep || 10, // what is the largest frequency multiplier
    idle: 600 // flush any synclets in tolerance when dashboard activity after this many seconds of none
  };
  exports.quiesce = (config.quiesce || 650) * 1000;

  config.dashboard = config.dashboard || {};
  config.dashboard.lockerName = config.dashboard.customLockerName || 'locker';
  exports.dashboard = config.dashboard;
  exports.mail = config.mail;

  // load trusted public keys
  var kdir = path.join(path.dirname(filepath), "keys");
  exports.keys = [];
  if(path.existsSync(kdir)) {
    var keys = fs.readdirSync(kdir);
    keys.forEach(function(key){
      if(key.indexOf(".pub") == -1) return;
      exports.keys.push(fs.readFileSync(path.join(kdir, key)).toString());
    });
  }

  setFromEnvs();
  exports.loaded = true;
};

function setBase() {
  exports.lockerBase = 'http://' + exports.lockerHost +
  (exports.lockerPort && exports.lockerPort != 80 ? ':' + exports.lockerPort : '');
  exports.externalBase = 'http';
  if(exports.externalSecure === true || (exports.externalPort == 443 && exports.externalSecure !== false))
    exports.externalBase += 's';
  exports.externalBase += '://' + exports.externalHost +
  (exports.externalPort && exports.externalPort != 80 && exports.externalPort != 443 ? ':' + exports.externalPort : '');
  if(exports.externalPath)
    exports.externalBase += exports.externalPath;
}

function setFromEnvs() {
  for(var i in process.env) {
    if(i.indexOf('LCONFIG_') === 0) {
      var value = process.env[i];
      i = i.substring(8);
      var keys = i.split('_');
      var obj = exports;
      for(var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if(j === keys.length - 1) {
          obj[key] = value;
          continue;
        }
        if(!obj[key]) obj[key] = {};
        obj = obj[key];
      }
    }
  }
  if(process.env.PORT) exports.lockerPort = process.env.PORT;
}
