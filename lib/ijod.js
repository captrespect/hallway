/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/


/*
* Indexed JSON On Disk
*/

var fs = require('fs');
var path = require('path');
var dal = require("dal");
var zlib = require("compress-buffer");
var lutil = require("lutil");
var async = require("async");
var mmh3 = require("murmurhash3");
var knox = require("knox");
var lconfig = require("lconfig");
var idr = require("idr");
var logger = require("logger").logger("IJOD");
var dMap = require('dMap');
var mmh = require("murmurhash3");
var instruments = require("instruments");
var memcachelib = require("optional-memcache");
var memcache;

exports.debug = false;

exports.initDB = function(callback) {
  memcache = memcachelib.memcacheClient();

  dal.bQuery(["CREATE TABLE IF NOT EXISTS ijod (idr VARCHAR(32) NOT NULL, base VARCHAR(32), path VARCHAR(255), hash VARCHAR(32), at BIGINT, offset INT, len INT, lat DECIMAL(8,5), lng DECIMAL(8,5), PRIMARY KEY(idr))"], function(err) {
    memcache.connect(function() {
      logger.info("Connected to memcache");
      callback(err);
    });
  });
}

var unicorn = 0; // ensure more uniqueness
function IJOD(basePath) {
  var self = this;
  this.transactionItems = null;
  this.transactionQueries = [];
  self.base = mmh.murmur128HexSync(basePath);
  self.path = path.join(self.base, "ijod." + Date.now()) + "." + unicorn++;
  self.len = 0;
  self.s3client = knox.createClient({
    key:lconfig.s3.key,
    secret:lconfig.s3.secret,
    bucket:lconfig.s3.bucket
  });
};
exports.IJOD = IJOD;

IJOD.prototype.startAddTransaction = function(cbDone) {
  if (this.transactionItems) return cbDone();
  this.transactionItems = [];
  this.transactionQueries = [];
  /*
  if (exports.debug) logger.debug("****************************** BEGIN in normal " + this.base);
  this.db.query("BEGIN", function(error, rows) { cbDone(); });
  */
  cbDone();
};

IJOD.prototype.commitAddTransaction = function(cbDone) {
  if (!this.transactionItems || this.transactionItems.length == 0) return cbDone();
  //console.log("Commiting %d items", this.transactionItems.length);
  var totalSize = this.transactionItems.reduce(function(prev, cur, idx, arr) { return prev + arr[idx].length; }, 0);
  instruments.modify({"ijod.write_total":totalSize}).send();
  var writeBuffer = new Buffer(totalSize);
  var idx = 0;
  var self = this;
  lutil.forEachSeries(self.transactionItems, function(item, cb) {
    item.copy(writeBuffer, idx);
    idx += item.length;
    cb();
  }, function(err) {
    var startTime = Date.now();
    var req = self.s3client.put(self.path, {
      "Content-Length":writeBuffer.length,
      "Content-Type":"x-ijod/gz",
      "x-amz-acl":"private"
    });
    req.on("response", function(res) {
      writeBuffer = null;
      // We end the transaction
      if (res.statusCode == 200) {
        async.forEachSeries(self.transactionQueries, function(query, cb) {
          dal.query(query.sql, query.binds, cb);
        }, function(error) {
          instruments.timing({"ijod.save_time":(Date.now() - startTime)}).send();
          instruments.increment("ijod.puts").send();
          //if (exports.debug) logger.debug("****************************** COMMIT in normal " + self.base);
          self.transactionItems = null;
          //self.db.query("COMMIT", function(error, rows) { cbDone(); });
          cbDone();
        });
      } else {
        instruments.increment("ijod.put_errors").send();
        if (exports.debug) logger.error("*************** GIANT ERROR WRITING TO S3 FOR IJOD");
        res.on("data", function(data) {
          if (exports.debug) logger.error(data.toString());
        });
        self.abortAddTransaction(cbDone);
      }
    });
    req.end(writeBuffer);
  });
};

/// Abort a pending add transaction
/**
* Any pending write chunks are destroyed and the database transaction is rolled back.
* This is safe to call without a transaction started.
*/
IJOD.prototype.abortAddTransaction = function(cbDone) {
  if (!this.transactionItems) return cbDone();
  this.transactionItems = null;
  //this.db.query("ROLLBACK", function(error, rows) { cbDone(); });
};

// takes arg of at least an id and data, callback(err) when done
IJOD.prototype.addData = function(arg, callback) {
  if(!arg || !arg.idr) return callback("invalid arg");
  var tmpJson = JSON.stringify(arg);
  var hash = arg.hash ? arg.hash : mmh3.murmur128HexSync(tmpJson);
  delete arg.hash;
  // ENTRY NORMALIZATION HAPPENS HERE 
  if(!arg.at) arg.at = Date.now();
  arg.id = idr.id(arg.idr);
  arg.idr = idr.toString(arg.idr);
  var ll = dMap.get('ll',arg.data,arg.idr) || [null,null];
  var self = this;
  this.startAddTransaction(function() {
    var tmpJson = JSON.stringify(arg);
    var gzdata = zlib.compress(new Buffer(tmpJson+"\n"));
    self.transactionItems.push(gzdata);
    var offset = self.len;
    self.len += gzdata.length;
    memcache.replace(idr.hash(arg.idr), tmpJson, function(error, result) { 
      // TODO, also replace idr2 in types?
    });
    self.transactionQueries.push({sql:"INSERT INTO ijod (idr, base, path, hash, at, offset, len, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), hash=VALUES(hash), at=VALUES(at), offset=VALUES(offset), len=VALUES(len)", binds:[idr.hash(arg.idr), idr.baseHash(arg.idr), self.path, hash, arg.at, offset, (self.len - offset), ll[0], ll[1]]});
    // if there's types, insert each of them too for filtering
    if(!arg.data || !arg.types) return callback();
    async.forEachSeries(Object.keys(arg.types), function(type, cb){
      var i2 = idr.clone(arg.idr);
      i2.protocol = type;
      instruments.increment("data.types." + type).send();
      if(typeof arg.types[type] == 'string') i2.hash = arg.types[type]; // also index this under an alternate data id!
      if(typeof arg.types[type] == 'object' && arg.types[type].auth) i2.auth = arg.types[type].auth; // also index this with a different auth!
      self.transactionQueries.push({sql:"INSERT INTO ijod (idr, base, path, hash, at, offset, len, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), hash=VALUES(hash), at=VALUES(at), offset=VALUES(offset), len=VALUES(len)", binds:[idr.hash(i2), idr.baseHash(i2), self.path, hash, arg.at, offset, (self.len - offset), ll[0], ll[1]]});
      cb();
    }, callback);
  });
}

// adds a deleted record to the ijod and removes from index
IJOD.prototype.delData = function(arg, callback) {
  if(!arg || !arg.id) return callback("invalid arg");
  arg.id = arg.id.toString(); // safety w/ numbers
  if(!arg.at) arg.at = Date.now();
  arg.type = "delete";
  var self = this;
  var gzdata = zlib.compress(new Buffer(JSON.stringify(arg)+"\n"));
  fs.write(self.fda, gzdata, 0, gzdata.length, null, function(err, written, buffer) {
    if (err) {
      return callback(err);
    }

    var at = self.len;
    self.len += gzdata.length;
    dal.query("DELETE FROM ijod WHERE id = ?", [arg.id], callback);
  });
}

/// Get a single entry from an IJOD, requested by specific IDR
exports.getOne = function(targetIdr, callback) {
  var startTime = Date.now();
  var self = this;
  // take the raw id if given too
  var hash = (typeof targetIdr == 'string' && targetIdr.indexOf(':') == -1) ? targetIdr : idr.hash(targetIdr);
  memcache.get(hash, function(error, result) {
    var js;
    try { js = JSON.parse(result[hash]) }catch(E){}
    if (error || result == "NOT_STORED" || result == null || !js) {
      var s3client = knox.createClient({
        key:lconfig.s3.key,
        secret:lconfig.s3.secret,
        bucket:lconfig.s3.bucket
      });
      dal.query("SELECT path, offset, len FROM ijod WHERE idr = ? LIMIT 1", [hash], function(error, rows) {
        if (error) return callback(error);
        if (rows.length != 1) return callback(new Error("Bad query for getOne"));

        var buf = new Buffer(rows[0].len);
        var appendPos = 0;
        if (exports.debug) logger.debug("%s - Range: bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1), rows[0].path);
        var s3StartTime = Date.now();
        var req = s3client.get(rows[0].path, {
          "Range":"bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1),
          "Content-Type":"x-ijod/gz"
        }).on("response", function(res) {
          if(res.statusCode >= 400) return callback(new Error("s3 fetch failed "+res.statusCode));
          // TODO have to catch on error here for overall s3 connection fail?
          res.on("data", function(chunk) {
            chunk.copy(buf, appendPos);
            appendPos += chunk.length;
          });
          res.on("end", function() {
            instruments.timing({"s3.getOne":(Date.now() - s3StartTime)}).send();
            var jsonStr = zlib.uncompress(buf).toString();
            var data = JSON.parse(jsonStr);
            if (exports.debug) logger.debug("Get one in %d", (Date.now() - startTime));
            memcache.set(hash, jsonStr, function(error, result) {
              if (error) logger.error(error);
              callback(null, data);
            });
          });
        }).end(); // s3client.get
      });
    } else {
      if (exports.debug) logger.debug("Get one in %d", (Date.now() - startTime));
      callback(null, js);
    }
  });
};

/// Select a time based range of IJOD entries.
/**
* range is optional and will default to all entries, when supplied it should 
* have start and end values.  The range is inclusive.
*
* Results are returned in reverse chronological order.
*/
exports.getRange = function(basePath, range, cbEach, cbDone, smoke) {
  var startRangeTime = Date.now();
  var s3client = knox.createClient({
    key:lconfig.s3.key,
    secret:lconfig.s3.secret,
    bucket:lconfig.s3.bucket
  });
  var self = this;

  var sql = "SELECT path, offset, len FROM ijod WHERE base = ?";
  var binds = [mmh.murmur128HexSync(basePath)];
  if (range && range.since) {
    sql += " AND at > ?";
    binds.push(range.since);
  }
  if (range && range.until) {
    sql += " AND at < ?";
    binds.push(range.until);
  }
  if (range && range.box) {
    sql += " AND lat > ? AND lat < ? AND lng > ? and lng < ?";
    range.box.lat.sort(function(a,b){return a-b});
    range.box.lng.sort(function(a,b){return a-b});
    binds.push(range.box.lat[0], range.box.lat[1], range.box.lng[0], range.box.lng[1]);
  }
  sql += " ORDER BY at DESC";
  if (range.limit) {
    sql += " LIMIT " + parseInt(range.limit);
  }
  if (range.offset) {
    sql += " OFFSET " + parseInt(range.offset);
  }
  if (exports.debug) {
    logger.debug("SQL: " + sql);
    logger.debug("Binds: " + JSON.stringify(binds));
  }
  dal.query(sql, binds, function(error, rows) {
    if (error) return cbDone(error);
    if (rows.length == 0) return cbDone(null);
    if (smoke) return cbDone(null, rows); // ugly hack added by jer, beware the smoke monster!

    var curPath = "";
    var ranges = [];

    // Process the curPath
    function processPath(pathData, cbPath) {
      if (pathData.ranges.length == 0) cbPath();

      if (exports.debug) logger.debug(JSON.stringify(pathData.ranges));
      
      // Find the extents and create a range string
      var start = pathData.ranges[0].start;
      var end = pathData.ranges[0].end;

      pathData.ranges.forEach(function(range) {
        if (range.start < start) start = range.start;
        if (range.end > end) end = range.end;
      });
      // Shift the offsets if we're not 0 based anymore
      if (start > 0) {
        pathData.ranges.forEach(function(range) {
          range.start -= start;
          range.end -= start;
        });
      }
      var rangeStr = "bytes=" + start + "-" + end;

      if (exports.debug) logger.debug("Ranges: " + rangeStr,pathData.path);
      var s3StartTime = Date.now();
      var req = s3client.get(pathData.path, {
        "Range":rangeStr,
        "Content-Type":"x-ijod/gz"
      }).on("response", function(res) {
        if (exports.debug) {
          logger.debug(res.statusCode);
          logger.debug(res.headers);
        }

        if (res.statusCode > 206) {
          logger.error("There was an error retrieving the data.  Status code: %d", res.statusCode);
          return cbPath(null, []);
        }

        var fullBuffer = new Buffer(end - start);
        var fullBufWritePos = 0;
        res.on("data", function(chunk) {
          chunk.copy(fullBuffer, fullBufWritePos);
          fullBufWritePos += chunk.length;
        });
        res.on("end", function() {
          instruments.timing({"s3.getRange":(Date.now() - s3StartTime)}).send();
          var pieces = [];
          pathData.ranges.forEach(function(range) {
            var curBuf = fullBuffer.slice(range.start, range.end);
            var decompressed = zlib.uncompress(curBuf);
            pieces.push(JSON.parse(decompressed.toString()));
          });
          cbPath(null, pieces);
        });
      }).end(); // s3client.get
    }

    function addRowToRanges(row, ranges) {
      ranges.push({len:row.len, start:row.offset, end:(row.offset + row.len)});
    }

    var paths = [];
    // Break this down into individual paths
    async.forEachSeries(rows, function(row, cb) {

      if (paths.length == 0 || row.path != paths[paths.length - 1].path) {
        paths.push({ranges:[], path:row.path});
      }
      addRowToRanges(row, paths[paths.length - 1].ranges);
      cb();
    }, function(error) {
      async.map(paths, processPath, function(error, results) {
        for (var i = 0; i < results.length; ++i) {
          if (!results[i]) continue;
          for (var j = 0; j < results[i].length; ++j) {
            cbEach(results[i][j]);
          }
        }
        if (exports.debug) logger.debug("Range run time: %d", (Date.now() - startRangeTime));
        return cbDone(error);
      });
    });
  });
};

exports.batchSmartAdd = function(entries, callback) {
  //console.log("Batch smart add %d entries", entries.length);
  if (entries.length == 0) return callback(new Error("0 length entries added"));
  var basePath = idr.pid(entries[0].idr);
  var ij = new IJOD(basePath);

  function handleError(msg) {
    if (exports.debug) {
      logger.error("Batch smart add error: %s", msg);
      logger.trace();
    }
  }

  var entryInClause = entries.map(function(entry) { return "'" + idr.hash(entry.idr) + "'"; }).join(",");
  if (exports.debug) logger.debug("SELECT idr,hash FROM ijod WHERE ijod.idr IN (" +  entryInClause + ")");
  dal.query("SELECT idr,hash FROM ijod WHERE ijod.idr IN (" +  entryInClause + ")", [], function(error, rows) {
    if (error) return handleError(error);
    var knownIds = {};
    rows = rows || [];
    rows.forEach(function(row) { 
      knownIds[row.idr] = row.hash;
    });
    ij.startAddTransaction(function() {
      async.forEachSeries(entries, function(entry, cb) {
        if (!entry) return cb();
        var entryIdrHash = idr.hash(entry.idr);
        if (knownIds[entryIdrHash]) {
          // See if we need to update
          var hash = mmh3.murmur128HexSync(JSON.stringify(entry));
          // If the id and hashes match it's the same!
          if (hash == knownIds[entryIdrHash]) {
            return cb();
          } else {
            entry.hash = hash;
          }
        } 
        ij.addData(entry, cb);
      }, function(error) {
        if (error) {
          ij.abortAddTransaction(function() {
            handleError(error);
          });
          return;
        };
        ij.commitAddTransaction(function(error) {
          callback(error);
        });
        //console.log("Batch done: %d", (Date.now() - t));
      }); // forEachSeries(entries)
    }); // startAddTransaction
  });
};

// just quickly return the at bounds of a potential range request
exports.getBounds = function(basePath, range, cbDone) {
  var sql = "SELECT MAX(at) as newest, MIN(at) as oldest, COUNT(*) as total FROM ijod WHERE base = ?";
  var binds = [mmh.murmur128HexSync(basePath)];
  if (range && range.since) {
    sql += " AND at > ?";
    binds.push(range.since);
  }
  if (range && range.until) {
    sql += " AND at < ?";
    binds.push(range.until);
  }
  if (range && range.box) {
    sql += " AND lat > ? AND lat < ? AND lng > ? and lng < ?";
    range.box.lat.sort(function(a,b){return a-b});
    range.box.lng.sort(function(a,b){return a-b});
    binds.push(range.box.lat[0], range.box.lat[1], range.box.lng[0], range.box.lng[1]);
  }
  sql += " ORDER BY at DESC";
  if (range.limit) {
    sql += " LIMIT " + parseInt(range.limit);
  }
  if (range.offset) {
    sql += " OFFSET " + parseInt(range.offset);
  }
  if (exports.debug)  logger.debug("SQL: ",sql,"Binds: ",JSON.stringify(binds));
  dal.query(sql, binds, function(error, rows) {
    if (error) return cbDone(error);
    if (rows.length == 0) return cbDone(null);
    cbDone(null,rows[0]);
  });
}

// Takes a complete changeset breaks it down by base and saves it to S3
exports.pump = function(arg, cbDone) {
  if(!arg || !Array.isArray(arg)) return cbDone(new Error("arg is missing or invalid: "+JSON.stringify(arg)));
  // XXX: Is this actually an error?
  if (arg.length == 0) return cbDone();

  // create a batch for each base
  var bases = {};
  arg.forEach(function(entry){
    var base = idr.pid(entry.idr);
    if(!bases[base]) bases[base] = [];
    bases[base].push(entry);
  });

  // do each clustering
  async.forEach(Object.keys(bases), function(base, cb){
    exports.batchSmartAdd(bases[base], cb);
  }, function(error){
    if (exports.debug) logger.debug("pump done",Object.keys(bases),error);
    cbDone(error ? error : null, error ? null : arg);    
  });
};

exports.countBase = function(base, cbDone) {
  dal.query("SELECT COUNT(*) AS baseCount FROM ijod WHERE base=?", [mmh.murmur128HexSync(base)], function(err, rows) {
    cbDone(err || rows.length == 0 ? undefined : rows[0].baseCount);
  });
};

// make a string and return only the interior data object!
function stripper(buf)
{
    var s = buf.toString("utf8");
    return s.slice(s.indexOf('{',1),s.lastIndexOf('}',s.length-3)+1); // -3 accounts for }\n
}
