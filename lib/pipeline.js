var async = require('async');
var logger = require('logger');
var lconfig = require('lconfig');
var path = require('path');
var fs = require('fs');
var dMap = require('dMap');
var IJOD = require('ijod');

dMap.load('twitter');
dMap.load('facebook');

// raw data coming from synclets, break it up and process each changeset
exports.incoming = function(arg, callback) {
  if(!arg || !arg.data || typeof arg.data != "object") return callback("arg.data is missing or invalid: "+JSON.stringify(arg));
  async.forEachSeries(Object.keys(arg.data), function(base, cb){
    var changeset = arg.data[base];
    if(!Array.isArray(changeset)) {
      logger.error(base+" changeset is not an array: "+typeof changeset);
      return cb(); // don't bail here, could be other chagesets!
    }
    // experimenting!
    var test = "";
    changeset.forEach(function(data){
      test += " "+dMap.get('id', data, base);
    });
    logger.info("processing "+base+" of length "+changeset.length+" with ids "+test);
    IJOD.batchSmartAdd(base, changeset, function(err){
      if(err) logger.error("batch add failed: "+err);
      logger.info("saved!");
      cb(err);
    })
  }, callback);
}
