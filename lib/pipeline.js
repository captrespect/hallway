var async = require('async');
var logger = require('logger');
var lconfig = require('lconfig');
var path = require('path');
var fs = require('fs');
var IJOD = require('ijod');
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
    logger.info("processing "+base+" of length "+changeset.length);
    IJOD.batchSmartAdd(base, changeset, function(err){
      if(err) logger.error("batch add failed: "+err);
      logger.info("saved!");
      cb(err);
    })
  }, callback);
}

// temporary place to put web service callbacks
exports.app = function(locker) {
  locker.get('/service/:syncletId/getCurrent/:type', function(req, res) {
    console.log("getCurrent for %s", req.params.syncletId);
      getIJOD(req.params.type, false, "orig-locker-me", function(ijod) {
          if(!ijod) return res.send("not found",404);
          ijod.reqCurrent(req, res);
      });
  });

  locker.get('/service/:syncletId/:type/id/:id', function(req, res) {
      getIJOD(req.params.type, false, "orig-locker-me", function(ijod) {
          if(!ijod) return res.send("not found",404);
          ijod.reqID(req, res);
      });
  });
}

// simple async friendly wrapper
function getIJOD(base, create, owner, callback) {
  var dataset = require('crypto').createHash('md5').update(base).digest('hex');
    if(ijods[dataset]) return callback(ijods[dataset]);
    var dir = path.join(lconfig.lockerDir, lconfig.me, "pipe");
    if (!path.existsSync(dir)) fs.mkdirSync(dir, 0755);
    var name = path.join(dir, dataset);
    // only load if one exists or create flag is set
    fs.stat(name+".db", function(err, stat){
        if(!stat && !create) return callback();
        var ij = new IJOD({name:name, owner:owner})
        ijods[dataset] = ij;
        ij.open(function(err) {
            if(err) logger.error(err);
            return callback(ij);
        });
    });
}
