var genericPool = require("generic-pool");
var lconfig = require("lconfig");
var path = require("path");
var async = require('async');
var logger = require("logger").logger("DAL");
var currentBackend = "mysqlclient";

var pool = genericPool.Pool({
  name: "db",
  create: function(callback) {
    try {
      var module = require(path.join(".", "dal-" + currentBackend + ".js"));
      module.create(lconfig.database, callback);
    } catch (E) {
      callback(E);
    }
  },
  destroy:function(client) {
    // TODO
  },
  max: lconfig.database.maxConnections,
  idleTimeoutMillis: 30000
});
module.exports = pool;

pool.setBackend = function(backend) {
  currentBackend = backend;
}
pool.getBackendModule = function() {
  var mod = require(path.join(".", "dal-" + currentBackend + ".js"));
  return mod;
}

// Helper for a future query debug logger
// E.stack.split("\n")[3].match(/at\s(.*)$/)[1]

// simple utility to run batch at once
pool.bQuery = function(db, queries, callback) {
  if(!queries || !Array.isArray(queries)) return callback(new Error("passed in queries is not an array"));
  async.forEachSeries(queries, function(scriptSql, cb) {
    logger.log("dal running %s", scriptSql);
    db.query(scriptSql, cb);
  }, function(err) {
    if(err) console.error("dal query failed: ",err);
    callback(err);
  });
}

// TODO:  batch insert statement

pool.query = function(sql, binds, cbDone) {
  if (!Array.isArray(binds)) {
    cbDone = binds;
    binds = [];
  }
  if (!cbDone) cbDone = function() {};

  var self = this;

  this.acquire(function(error, db) {
    if (error) return cbDone(new Error(error));

    logger.debug(sql);
    return db.query(sql, binds, function(error, rows) {
      self.release(db);
      cbDone(error, rows);
    });
  });
}
