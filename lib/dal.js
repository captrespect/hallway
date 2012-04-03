var genericPool = require("generic-pool");
var lconfig = require("lconfig");
var path = require("path");

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
  max: 10,
  idleTimeoutMillis: 30000,
  log: true
});
module.exports = pool;

exports.setBackend = function(backend) {
  currentBackend = backend;
}
