var lconfig = require("lconfig");
var events = require("events");
var util = require("util");

function DisabledMemcache() {
}
util.inherits(DisabledMemcache, events.EventEmitter);
DisabledMemcache.prototype.connect = function(cb) {
  cb(null);
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
    var mc = require("mc");
    return new mc.Client(lconfig.memcache.host + ":" + lconfig.memcache.port);
  } else {
    return new DisabledMemcache();
  }
}
