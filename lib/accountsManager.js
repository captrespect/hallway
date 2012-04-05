var lconfig = require("lconfig");
var dal = require('dal');

exports.init = function(callback) {
  console.error("accounts init");
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    var creates = [
      "CREATE TABLE IF NOT EXISTS Accounts (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, account VARCHAR(255), app VARCHAR(255), profile VARCHAR(255))",
      "CREATE TABLE IF NOT EXISTS Apps (`app` VARCHAR(255) PRIMARY KEY, secret VARCHAR(255), apikeys TEXT, notes TEXT)"
    ];
    dal.bQuery(db, creates, function(err){
      dal.release(db);
      if(err) console.error("accounts init failed! ",err);
      callback(err);
    });
  });
}

// looks for any account matching this app+profile
exports.getAppProfile = function(app, profile, callback) {
  console.error("getting app profile "+app+" "+profile);
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    db.query("SELECT account FROM Accounts WHERE app = ? AND profile = ? LIMIT 1", [app, profile], function(err, rows) {
      rows = rows || [];
      dal.release(db);
      callback(err, rows[0]);
    });
  });
}

// account id is optional, creates new random one and returns it if none
exports.addAppProfile = function(id, app, profile, callback) {
  console.error("adding app profile "+id+" "+app+" "+profile);
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    id = id || require('crypto').createHash('md5').update(Math.random().toString()).digest('hex');
    db.query("INSERT INTO Accounts (account, app, profile) VALUES (?, ?, ?)", [id, app, profile], function(err) {
      dal.release(db);
      callback(err, {account:id, app:app, profile:profile});
    });
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

// just fetch the info for a given app id
exports.getApp = function(app, callback) {
  console.error("getting app "+app);
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    db.query("SELECT app, secret, apikeys FROM Apps WHERE app = ? LIMIT 1", [app], function(err, rows) {
      rows = rows || [];
      dal.release(db);
      callback(err, rows[0]);
    });
  });
}

// for a given account, return all the profiles
exports.getProfiles = function(account, callback) {
  console.error("getting account profiles "+account);
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    db.query("SELECT profile FROM Accounts WHERE account = ?", [account], function(err, rows) {
      rows = rows || [];
      dal.release(db);
      callback(err, rows);
    });
  });
}

