var lconfig = require("lconfig");
var dal = require('dal');
var logger = require('logger').logger('acl');
var crypto = require('crypto');

exports.init = function(callback) {
  logger.debug("acl init");
  var creates = [
    "CREATE TABLE IF NOT EXISTS Accounts (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, account VARCHAR(255), app VARCHAR(255), profile VARCHAR(255))",
    "CREATE TABLE IF NOT EXISTS Apps (`app` VARCHAR(255) PRIMARY KEY, secret VARCHAR(255), apikeys TEXT, notes TEXT)"
  ];
  dal.bQuery(creates, function(err){
    if(err) logger.error("accounts init failed! ",err);
    callback(err);
  });
}

// looks for any account matching this app+profile
exports.getAppProfile = function(app, profile, callback) {
  logger.debug("getting app profile "+app+" "+profile);
  dal.query("SELECT account FROM Accounts WHERE app = ? AND profile = ? LIMIT 1", [app, profile], function(err, rows) {
    rows = rows || [];
    callback(err, rows[0]);
  });
}

// account id is optional, creates new random one and returns it if none
exports.addAppProfile = function(id, app, profile, callback) {
  logger.debug("adding app profile "+id+" "+app+" "+profile);
  id = id || require('crypto').createHash('md5').update(Math.random().toString()).digest('hex');
  dal.query("INSERT INTO Accounts (account, app, profile) VALUES (?, ?, ?)", [id, app, profile], function(err) {
    callback(err, {account:id, app:app, profile:profile});
  });
}

// convenience to find existing or create new if none
exports.getOrAdd = function(id, app, profile, callback) {
  // lookup app+profile, if existing return account id, if none create one
  exports.getAppProfile(app, profile, function(err, account) {
    if(err) return callback(err);
    if(account) return callback(null, account);
    exports.addAppProfile(id, app, profile, callback);
  });
}

exports.getAppsForAccount = function(account, callback) {
  logger.debug("getting apps for account "+account);
  dal.query("SELECT app, secret, apikeys, notes FROM Apps", [], function(err, rows) {
    var apps = [];
    for (var i = 0; i < rows.length; i++) {
      try {
        rows[i].notes = JSON.parse(rows[i].notes);
      } catch(E) {
        rows[i].notes = {};
      }
      if (rows[i].notes && rows[i].notes.account && rows[i].notes.account === account) {
        apps.push(rows[i]);
      }
    }
    callback(err, apps);
  });
};

// just fetch the info for a given app id
exports.getApp = function(app, callback) {
  logger.debug("getting app "+app);
  dal.query("SELECT app, secret, apikeys, notes FROM Apps WHERE app = ? LIMIT 1", [app], function(err, rows) {
    rows = rows || [];
    // optionally parse any json
    if(rows[0])
    {
      try {
        rows[0].apikeys = JSON.parse(rows[0].apikeys);
      } catch(E) {
        rows[0].apikeys = {};
      }
      try {
        rows[0].notes = JSON.parse(rows[0].notes);
      } catch(E) {
        rows[0].notes = {};
      }
    }
    callback(err, rows[0]);
  });
};

// update the notes field which contains the user configurable data
exports.updateApp = function(appId, newNotes, callback) {
  logger.debug("updating app "+appId);
  var q = dal.query("UPDATE Apps set notes=? WHERE app=?", [JSON.stringify(newNotes), appId], function(err) {
    if (err) logger.error("query failed: ", q, err);
    callback(err);
  });
};


// create a new app and generate it's keys
exports.addApp = function(notes, callback) {
  logger.debug("creating new app from ",notes);
  // may want to encrypt something into this id someday
  app = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  secret = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  var q = dal.query("INSERT INTO Apps (app, secret, notes) VALUES (?, ?, ?)", [app, secret, JSON.stringify(notes)], function(err) {
    if(err) logger.error(q, err);
    if(err) return callback(err);
    notes.key = app;
    notes.secret = secret;
    callback(null, notes);
  });
};

// for a given account, return all the profiles
exports.getProfiles = function(account, callback) {
  logger.debug("getting account profiles "+account);
  dal.query("SELECT profile FROM Accounts WHERE account = ?", [account], function(err, rows) {
    rows = rows || [];
    // TODO make this result set easier to use by indexing the service name mappings
    callback(err, rows);
  });
}

// whackawhacka
exports.delProfiles = function(account, callback) {
  logger.debug("deleting account profiles "+account);
  dal.query("DELETE FROM Accounts WHERE account = ?", [account], callback);
}

