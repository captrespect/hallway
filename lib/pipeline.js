var async = require('async');
var logger = require('logger');
var ijod = require('ijod');
var ijods = {};

// raw data coming from synclets, break it up and process each changeset
exports.incoming = function(arg, callback) {
  if(!arg || !arg.data || typeof arg.data != "object") return callback("arg.data is missing or invalid");
  async.forEachSeries(Object.keys(arg.data), function(base, cb){
    var changeset = arg.data[base];
    if(!Array.isArray(changeset)) {
      logger.error(base+" changeset is not an array: "+typeof changeset);
      return cb(); // don't bail here, could be other chagesets!
    }
    console.error("processing "+base+" of length "+changeset.length);
  }, callback);
}
