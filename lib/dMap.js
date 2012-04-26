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

// across all the given profiles, return an array of bases for a given type
exports.types = function(type, profiles) {
  var ret = [];
  if(!profiles) return ret;
  profiles.forEach(function(profile){
    var pid = profile.split('@');
    var svc = maps[pid[1]];
    if(!svc) return;
    var types = svc['types'];
    if(!types) return;
    var bases = types[type];
    if(!bases) return;
    bases.forEach(function(base){
      base = idr.clone(base);
      base.auth = pid[0];
      ret.push(idr.toString(base));
    });
  })
  return ret;
}


// load up the map per service
exports.load = function(service) {
  maps[service] = {};
  try {
    maps[service] = require(path.join('services', service, 'map.js'));
  }catch(E){
    logger.error("failed to load "+service+"/map.js ",E);
  }
}

// TODO these should be done somewhere else or in an init function or somesuch
exports.load('twitter');
exports.load('facebook');
exports.load('instagram');
exports.load('foursquare');

