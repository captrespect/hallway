var async = require('async');
var logger = require('logger').logger("pipeline");
var lconfig = require('lconfig');
var path = require('path');
var fs = require('fs');
var dMap = require('dMap');
var IJOD = require('ijod');
var NotificationCenter = require("notificationcenter");
var idr = require("idr");

exports.inject = function(arg, cbDone) {
  if (!arg || typeof(arg) != "object") {
    logger.debug(arg);
    return cbDone("arg is not a keyed synclet result");
  }

  var entries = [];
  Object.keys(arg).forEach(function(base) {
    var baseIdr = idr.base(base);
    arg[base].forEach(function(entry) {
      var entryIdr = idr.clone(baseIdr);
      entryIdr.hash = dMap.get("id", entry, base);
      entries.push({idr:entryIdr, data:entry});
    });
  });

  if (entries.length == 0) return cbDone();

  function injector(cbInject) {
    logger.debug("Injecting %d entries", entries.length);
    return cbInject(null, entries);
  }
  var pumps = pumpingStations.slice(0);
  pumps.unshift(injector);
  async.waterfall(pumps, cbDone);
};

// XXX:  For now this is hardcoded, but it should be a bit more dynamically built based on the users apps
var pumpingStations = [
  IJOD.pump,
  NotificationCenter.pump
];
