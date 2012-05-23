var lconfig = require("lconfig");
var events = require("events");
var util = require("util");

function DisabledMemcache() {
}
util.inherits(DisabledMemcache, events.EventEmitter);
DisabledMemcache.prototype.connect = function() {
  this.emit("connect");
};
DisabledMemcache.prototype.get = function(key, cb) {
  cb(null, "NOT_STORED");
};
DisabledMemcache.prototype.replace = function(key, value, cb) {
  cb(null, "NOT_STORED");
};
DisabledMemcache.prototype.set = function(key, value, cb) {
  cb(null, "NOT_STORED");
};

exports.memcacheClient = function() {
  if (lconfig.memcache && lconfig.memcache.host && lconfig.memcache.port) {
    var memcacheLib = require("memcache");
    return new memcacheLib.Client(lconfig.memcache.port, lconfig.memcache.host);
  } else {
    return new DisabledMemcache();
  }
}
