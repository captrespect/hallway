var async = require('async');
var logger = require('logger').logger("pipeline");
var lconfig = require('lconfig');
var path = require('path');
var fs = require('fs');
var dMap = require('dMap');
var IJOD = require('ijod');
var NotificationCenter = require("notificationcenter");
var idr = require("idr");

exports.prepareEntries = function(arg, cbDone) {
  var entries = [];
  Object.keys(arg).forEach(function(base) {
    var baseIdr = idr.base(base);
    arg[base].forEach(function(entry) {
      var entryIdr = idr.clone(baseIdr);
      entryIdr.hash = dMap.get("id", entry, base);
      entries.push({idr:entryIdr, data:entry});
    });
  });
  return entries;
};

exports.inject = function(arg, cbDone) {
  function injector(cbInject) {
    return cbInject(null, arg);
  }
  var pumps = pumpingStations.slice(0);
  pumps.unshift(exports.prepareEntries);
  pumps.unshift(injector);
  async.waterfall(pumps, cbDone);
};

// XXX:  For now this is hardcoded, but it should be a bit more dynamically built based on the users apps
var pumpingStations = [
  exports.prepareEntries,
  IJOD.pump,
  NotificationCenter.pump
];
