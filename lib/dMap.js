var idr = require('idr');
var fs = require('fs');
var path = require('path');
var logger = require('logger');

var maps = {};

exports.get = function(name, data, base) {
  var r = idr.parse(base);
  var svc = maps[r.host] || {};
  var map = svc[r.protocol] || {};
  if(typeof map[name] === 'function') return map[name](data);
  return data[map[name] || name];
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