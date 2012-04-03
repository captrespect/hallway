var mysql = require("mysql");
var lconfig = require("lconfig");
var db;
var accounts = {};

exports.init = function(callback) {
  db = mysql.createClient({
    host:lconfig.database.hostname, 
    user:lconfig.database.username,
    password:lconfig.database.password,
    database:lconfig.database.database
  });
  db.query("CREATE TABLE IF NOT EXISTS Accounts (`id` VARCHAR(255) PRIMARY KEY, app VARCHAR(255), service VARCHAR(255), token VARCHAR(255))", function(err) {
    if(err) logger.error("create accounts failed: "+err);
    db.query("CREATE TABLE IF NOT EXISTS Apps (`app` VARCHAR(255) PRIMARY KEY, secret VARCHAR(255), notes TEXT)", function(err) {
      if(err) logger.error("create apps failed: "+err);
      callback(err);
    });
  });
}

exports.getAccount = function(account_id, callback) {
  process.nextTick(function() {
    return callback(undefined, accounts[account_id]);
  })
}

exports.createAccount = function(callback) {
  return process.nextTick(function() {
    var account_id = Math.random().toString();
    var user = accounts[account_id] = {account_id:account_id, accounts:{}};
    callback(undefined, user);
  });
}

exports.addProviderToAccount = function(account_id, providerName, auth, callback) {
  exports.getAccount(account_id, function(err, user) {
    if (err) return callback(err, user);
    if (!user) return callback(new Error('no user with id ' + account_id));
    user.accounts[providerName] = auth;
    return callback(undefined, user);
  });
}

exports.createAccountWithProivder = function(providerName, auth, callback) {
  exports.createAccount(function(err, user) {
    if (err) return callback(err);
    if (!user) return callback(new Error('could not create a user'));
    exports.addProviderToAccount(user.account_id, providerName, auth, callback);
  })
}