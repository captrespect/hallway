var idr = require('idr');
var fs = require('fs');
var path = require('path');
var logger = require('logger');

var maps = {};

// util to extract a common key from a raw data json object from a given service
exports.get = function(name, data, base) {
  var r = idr.parse(base);
  var svc = maps[r.host] || {};
  var map = svc[r.protocol] || {};
  if(typeof map[name] === 'function') return map[name](data);
  return data[map[name] || name];
}

// use a similar pattern for default service-level mapping values
exports.defaults = function(service, name) {
  var svc = maps[service] || {};
  var map = svc['defaults'] || {};
  return map[name] || name;
}

// load up the map per service
exports.load = function(service) {
  maps[service] = {};
  try {
    maps[service] = require(path.join(__dirname, '..', 'Connectors', service, 'map.js'));
  }catch(E){
    logger.error("failed to load "+service+"/map.js ",E);
  }
}

// TODO these should be done somewhere else or in an init function or somesuch
exports.load('twitter');
exports.load('facebook');
exports.load('instagram');
exports.load('foursquare');

