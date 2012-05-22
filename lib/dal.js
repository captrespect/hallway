var genericPool = require("generic-pool");
var lconfig = require("lconfig");
var path = require("path");
var async = require('async');
var logger = require("logger").logger("DAL");
var instruments = require("instruments");

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
  max: lconfig.database.maxConnections || 20,
  idleTimeoutMillis: 30000
});

exports.setBackend = function(backend) {
  currentBackend = backend;
}
exports.getBackendModule = function() {
  var mod = require(path.join(".", "dal-" + currentBackend + ".js"));
  return mod;
}

// Helper for a future query debug logger
// E.stack.split("\n")[3].match(/at\s(.*)$/)[1]

// // simple utility to run batch at once
exports.bQuery = function(queries, callback) {
  if(!queries || !Array.isArray(queries)) return callback(new Error("passed in queries is not an array"));
  async.forEachSeries(queries, function(scriptSql, cb) {
    exports.query(scriptSql, [], cb);
  }, function(err) {
    if(err) console.error("dal query failed: ",err);
    callback(err);
  });
}

exports.query = function(sql, binds, cbDone) {
  var self = this;

  var startTime = Date.now();
  pool.acquire(function(error, db) {
    if (error) return cbDone(new Error(error));

    return db.query(sql, binds, function(error, rows) {
      pool.release(db);
      instruments.timing({"dal.query_length": (Date.now() - startTime)}).send();
      instruments.increment("dal.query_count").send();
      if (cbDone) cbDone(error, rows);
    });
  });
}
