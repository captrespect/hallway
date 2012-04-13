var genericPool = require("generic-pool");
var lconfig = require("lconfig");
var path = require("path");
var async = require('async');

var currentBackend = "mysql";

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
  destroy:function() {
  },
  max: 100,
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

// simple utility to run batch at once
pool.bQuery = function(db, queries, callback) {
  if(!queries || !Array.isArray(queries)) return callback(new Error("passed in queries is not an array"));
  async.forEachSeries(queries, function(scriptSql, cb) {
    console.log("dal running %s", scriptSql);
    db.query(scriptSql, cb);
  }, function(err) {
    if(err) console.error("dal query failed: ",err);
    callback(err);
  });
}
