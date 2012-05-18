var idr = require('idr');
var fs = require('fs');
var path = require('path');
var logger = require('logger');

var maps = {};

// util to extract a common key from a raw data json object from a given service
exports.get = function(name, data, base) {
  var r = idr.parse(base);
  var svc = maps[r.host] || maps.system;
  var map = svc[r.protocol] || {};
  if(typeof map[name] === 'function') return map[name](data);
  return data[map[name] || name];
}

// use a similar pattern for default service-level mapping values
exports.defaults = function(service, name) {
  var svc = maps[service] ||maps.system;
  var map = svc['defaults'] || {};
  return map[name] || name;
}

// map all the defined fields for an entry
exports.map = function(entry) {
  var ret = {};
  if(!entry || !entry.data) return ret;
  var r = idr.parse(entry.idr);
  if(!r) return ret;
  var svc = maps[r.host] || maps.system;
  var map = svc[r.protocol] || {};
  Object.keys(map).forEach(function(name){
    if(name == 'at') return;
    var x = (typeof map[name] === 'function') ? map[name](entry.data) : entry.data[map[name]];
    if(x) ret[name] = x;
  });
  return ret;
}

// return a media function if any
exports.media = function(entry) {
  if(!entry || !entry.data) return ret;
  var r = idr.parse(entry.idr);
  if(!r) return null;
  var svc = maps[r.host] || maps.system;
  var media = svc.media || {};
  return media[r.protocol];
}

// turn a profile into all possible bases for it
exports.bases = function(profiles) {
  var ret = [];
  if(!profiles) return ret;
  profiles.forEach(function(profile){
    var pid = profile.split('@');
    var svc = maps[pid[1]] || maps.system;
    var defaults = svc['defaults'];
    if(!defaults) return;
    Object.keys(defaults).forEach(function(context){
      var r = defaults[context]+":"+profile+"/"+context;
      ret.push(r);
    });
  })
  return ret;
}

// across all the given profiles, return an array of bases for a given type
exports.types = function(type, profiles) {
  var ret = [];
  if(!profiles) return ret;
  profiles.forEach(function(profile){
    var pid = profile.split('@');
    var svc = maps[pid[1]] || maps.system;
    var types = svc['types'];
    if(!types) return;
    var bases = types[type];
    if(type.indexOf('all') == 0)
    {
      bases = [];
      Object.keys(types).forEach(function(stype){
        // all must match _feed, lame hard-wired thing meh
        if(stype.indexOf('_feed') > 0 && type.indexOf('_feed') == -1) return;
        if(type.indexOf('_feed') > 0 && stype.indexOf('_feed') == -1) return;
        if(stype == 'contacts') return;
        types[stype].forEach(function(base){ bases.push(base) });
      });
    }
    if(!bases) return;
    bases.forEach(function(base){
      base = idr.clone(base);
      base.auth = pid[0];
      ret.push(idr.toString(base));
    });
  })
  return ret;
}

// run a specific service pumps, usually last
exports.pump = function(cset, callback) {
  cset.forEach(function(entry){
    var r = idr.parse(entry.idr);
    var svc = maps[r.host] || maps.system;
    if(!svc.pumps) return;
    // run all for now, TODO need selectivity here
    Object.keys(svc.pumps).forEach(function(name){
      if(!svc.pumps[name][r.protocol]) return;
      svc.pumps[name][r.protocol](entry);
    });
  });
  callback(null, cset);
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

// system level defaults
maps.system = {
  defaults: {
    anubis: 'logs'
  }  
}

// TODO these should be done somewhere else or in an init function or somesuch
exports.load('twitter');
exports.load('facebook');
exports.load('instagram');
exports.load('foursquare');
exports.load('tumblr');
exports.load('linkedin');
exports.load('email');
exports.load('fitbit');

