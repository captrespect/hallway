var async = require('async');
var logger = require('logger').logger("pipeline");
var lconfig = require('lconfig');
var path = require('path');
var fs = require('fs');
var dMap = require('dMap');
var IJOD = require('ijod');
var NotificationCenter = require("notificationcenter");
var idr = require("idr");
var instruments = require("instruments");

// for monitoring tracking data delays
exports.delayz = {};

exports.inject = function(arg, cbDone) {
  var pipelineStart = Date.now();
  if(!arg) return cbDone();
  if (typeof(arg) != "object") {
    logger.debug(arg);
    return cbDone("arg is not a keyed synclet result");
  }

  var entries = [];
  Object.keys(arg).forEach(function(base) {
    if(!Array.isArray(arg[base]))
    {
      logger.warn("got wrong type",typeof arg[base]);
      return;
    }
    var baseIdr = idr.base(base);
    var delayc = 0;
    var delayt = 0;
    var keyCount = 0;
    var metric = {};
    arg[base].forEach(function(entry) {
      var entryIdr = idr.clone(baseIdr);
      var entryId = dMap.get("id", entry, base);
      if (!entryId) {
        logger.error("Could not get an id from the entry: %j "+base, entry);
        return;
      }
      entryId = entryId.toString(); // ensure always a string
      entryIdr.hash = entryId;
      var at = dMap.get("at", entry, base);
      // use the created timestamp from the raw data if any
      if(at) { // track for overall delay monitoring
        delayc++;
        delayt += Date.now() - at;
      } else {
        at = Date.now();
      }
      ++keyCount;
      entries.push({idr:entryIdr, id:idr.hash(entryIdr), data:entry, at:at});
      var instrumentKey = "data.services." + baseIdr.host + "." + entryIdr.path;
      if (!metric[instrumentKey]) metric[instrumentKey] == 0;
      ++metric[instrumentKey]
    });
    instruments.modify(metric).send();
    // store last delay value for every base for now (TODO need to GC it soemday when lots)
    if(delayc > 0) exports.delayz[idr.toString(baseIdr)] = parseInt(delayt / delayc);
  });

  if (entries.length == 0) return cbDone();



  function injector(cbInject) {
    logger.debug("Injecting %d entries", entries.length);
    return cbInject(null, entries);
  }
  var pumps = arg.pumps || pumpingStations.slice(0);
  pumps.unshift(injector);
  // This final step is so we can do timing and other stats
  pumps.push(function(cbStatsDone) {
    instruments.timing({"pipeline.run":(Date.now() - pipelineStart)}).send();
    return cbStatsDone();
  });
  async.waterfall(pumps, cbDone);
};

// XXX:  For now this is hardcoded, but it should be a bit more dynamically built based on the users apps
var pumpingStations = [
  require('services/links/resolve').pump,
  require('services/links/oembed').pump,
  dMap.pump,
  IJOD.pump,
  NotificationCenter.pump
];
