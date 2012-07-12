var async = require('async');
var logger = require('logger').logger("pipeline");
var lconfig = require('lconfig');
var path = require('path');
var fs = require('fs');
var dMap = require('dMap');
var IJOD = require('ijod');
var idr = require("idr");
var instruments = require("instruments");
var resolve = require('services/links/resolve');
var oembed = require('services/links/oembed');
var push = require('push');

exports.inject = function(arg, auth, cbDone) {
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
      var instrumentKey = "data.services." + baseIdr.host + "." + entryIdr.path.substring(1);
      if (metric[instrumentKey] == undefined) metric[instrumentKey] = 0;
      ++metric[instrumentKey]
    });
    instruments.modify(metric).send();
  });

  if (entries.length == 0) return cbDone();

  // XXX:  For now this is hardcoded, but it should be a bit more dynamically built based on the users apps
  // TODO: might be better to change the passed arg into a generic holder object, that hase the full changeset, broken out arrays by base, auth, etc
  var pumpingStations = [
    resolve.pump,
    oembed.pump,
    dMap.pump,
    IJOD.pump,
    function(cset, cb) { push.pump(cset, auth, cb) }
  ];

  function injector(cbInject) {
    logger.debug("Injecting %d entries", entries.length);
    return cbInject(null, entries);
  }
  var pumps = arg.pumps || pumpingStations.slice(0);
  pumps.unshift(injector);
  // This final step is so we can do timing and other stats
  pumps.push(function(arg, cbStatsDone) {
    instruments.timing({"pipeline.run":(Date.now() - pipelineStart)}).send();
    return cbStatsDone();
  });
  async.waterfall(pumps, cbDone);
};

