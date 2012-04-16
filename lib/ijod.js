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

exports.debug = false;

exports.initDB = function(callback) {
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    dal.bQuery(db, ["CREATE TABLE IF NOT EXISTS ijod (idr VARCHAR(32) NOT NULL, base VARCHAR(32), path VARCHAR(255), hash VARCHAR(32), at BIGINT, offset INT, len INT, PRIMARY KEY(idr))"], function(err) {
      dal.release(db);
      callback(err);
    });
  });
}

function IJOD(basePath) {
  var self = this;
  this.transactionItems = null;
  self.base = mmh.murmur128HexSync(basePath);
  self.path = path.join(self.base, "ijod." + Date.now());
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
  if (exports.debug) console.log("****************************** BEGIN in normal " + this.base);
  this.db.query("BEGIN", function(error, rows) { cbDone(); });
};

IJOD.prototype.commitAddTransaction = function(cbDone) {
  if (!this.transactionItems || this.transactionItems.length == 0) return cbDone();
  //console.log("Commiting %d items", this.transactionItems.length);
  var totalSize = this.transactionItems.reduce(function(prev, cur, idx, arr) { return prev + arr[idx].length; }, 0);
  var writeBuffer = new Buffer(totalSize);
  var idx = 0;
  var self = this;
  lutil.forEachSeries(self.transactionItems, function(item, cb) {
    item.copy(writeBuffer, idx);
    idx += item.length;
    cb();
  }, function(err) {
    var req = self.s3client.put(self.path, {
      "Content-Length":writeBuffer.length,
      "Content-Type":"x-ijod/gz",
      "x-amz-acl":"private"
    });
    req.on("response", function(res) {
      writeBuffer = null;
      // We end the transaction
      if (res.statusCode == 200) {
        if (exports.debug) console.log("****************************** COMMIT in normal " + self.base);
        self.transactionItems = null;
        self.db.query("COMMIT", function(error, rows) { cbDone(); });
      } else {
        if (exports.debug) console.error("*************** GIANT ERROR WRITING TO S3 FOR IJOD");
        res.on("data", function(data) {
          if (exports.debug) console.error(data.toString());
        });
        if (exports.debug) console.dir(res);
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
  this.db.query("ROLLBACK", function(error, rows) { cbDone(); });
};

// takes arg of at least an id and data, callback(err) when done
IJOD.prototype.addData = function(arg, callback) {
  if(!arg || !arg.idr) return callback("invalid arg");
  var tmpJson = JSON.stringify(arg);
  var hash = arg.hash ? arg.hash : mmh3.murmur128HexSync(tmpJson);
  delete arg.hash;
  if(!arg.at) arg.at = Date.now();
  var self = this;
  this.startAddTransaction(function() {
    var tmpJson = JSON.stringify(arg);
    var gzdata = zlib.compress(new Buffer(tmpJson+"\n"));
    self.transactionItems.push(gzdata);
    var offset = self.len;
    self.len += gzdata.length;
    self.db.query("REPLACE INTO ijod VALUES (?, ?, ?, ?, ?, ?, ?)", [idr.hash(arg.idr), idr.baseHash(arg.idr), self.path, hash, arg.at, offset, (self.len - offset)], callback);
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
    self.db.query("DELETE FROM ijod WHERE id = ?", [arg.id], callback);
  });
}

/// Get a single entry from an IJOD, requested by specific IDR
exports.getOne = function(targetIdr, callback) {
  var s3client = knox.createClient({
    key:lconfig.s3.key,
    secret:lconfig.s3.secret,
    bucket:lconfig.s3.bucket
  });
  var self = this;
  dal.acquire(function(error, db) {
    function cbError(msg) {
      dal.release(db);
      return callback(msg);
    }
    if (error) return cbError(error);
    if (exports.debug) {
      console.dir(targetIdr);
      console.log(idr.hash(targetIdr));
    }
    db.query("SELECT path, offset, len FROM ijod WHERE idr = ? LIMIT 1", [idr.hash(targetIdr)], function(error, rows) {
      if (error) return cbError(error);
      if (rows.length != 1) return cbError(new Error("Bad query for getOne"));

      var buf = new Buffer(rows[0].len);
      var appendPos = 0;
      if (exports.debug) console.log("%s - Range: bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1), rows[0].path);
      var req = s3client.get(rows[0].path, {
        "Range":"bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1),
        "Content-Type":"x-ijod/gz"
      }).on("response", function(res) {
        if (exports.debug) console.log("Starting");
        res.on("data", function(chunk) {
          if (exports.debug) console.log("Appending chunk");
          chunk.copy(buf, appendPos);
          appendPos += chunk.length;
        });
        res.on("end", function() {
          if (exports.debug) console.log("Done");
          var data = JSON.parse(zlib.uncompress(buf).toString());
          dal.release(db);
          callback(null, data);
        });
      }).end(); // s3client.get
    }); // db.query
  }); // dal.acquire
};

/// Select a time based range of IJOD entries.
/**
* range is optional and will default to all entries, when supplied it should 
* have start and end values.  The range is inclusive.
*
* Results are returned in chronological order.
*/
exports.getRange = function(basePath, range, cbEach, cbDone) {
  var s3client = knox.createClient({
    key:lconfig.s3.key,
    secret:lconfig.s3.secret,
    bucket:lconfig.s3.bucket
  });
  var self = this;
  dal.acquire(function(error, db) {
    function cbError(msg) {
      dal.release(db);
      return cbDone(msg);
    }
    if (error) return cbError(error);
    var sql = "SELECT path, offset, len FROM ijod WHERE base = ?";
    var binds = [mmh.murmur128HexSync(basePath)];
    if (range && range.start && range.end) {
      sql += " AND (at >= ? AND at <= ?)";
      binds.push(range.start);
      binds.push(range.end);
    }
    sql += " ORDER BY at";
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
    db.query(sql, binds, function(error, rows) {
      if (error) return cbError(error);
      if (rows.length == 0) return cbError(null);

      var curPath = "";
      var ranges = [];

      // Process the curPath
      function processPath(cbPath) {
        if (ranges.length == 0) cbPath();

        if (exports.debug) logger.debug(JSON.stringify(ranges));
        // Gather the ranges, collapsing as we can
        var rangeStr;
        var start = ranges[0].start;
        var end = ranges[0].end;
        function appendRange(start, end) {
          if (!rangeStr) {
            rangeStr = "bytes=";
          } else {
            rangeStr += ",";
          }
          rangeStr += start + "-" + end;
        }

        for (var i = 1; i < ranges.length; ++i) {
          if (ranges[i].start != end + 1) {
            appendRange(start, end);
            start = ranges[i].start;
            end = ranges[i].end;
          } else {
            end = ranges[i].end;
          }
        }
        appendRange(start, end);
        if (exports.debug) logger.debug("Ranges: " + rangeStr);
        var req = s3client.get(curPath, {
          "Range":rangeStr,
          "Content-Type":"x-ijod/gz"
        }).on("response", function(res) {
          var curRange;
          var curBuf;
          function nextRange() {
            if (exports.debug) {
              logger.debug("current range: " + JSON.stringify(curRange));
            }
            if (curBuf) {
              require("fs").writeFileSync("chunk.gz", curBuf);
              try {
                var decompressed = zlib.uncompress(curBuf);
                logger.debug(decompressed);
                cbEach(JSON.parse(decompressed.toString()));
              } catch (E) {
                logger.error(E);
                throw E;
              }
            }
            curRange = ranges.shift();
            if (!curRange) return;
            curRange.writePos = 0;
            curBuf = new Buffer(curRange.len);
          }
          nextRange();
          res.on("data", function(chunk) {
            var chunkLeft = chunk.length;
            if (exports.debug) logger.debug("Got a chunk of " + chunk.length + " bytes");
            while (curRange && chunkLeft > 0){
              var writeLen = curRange.len - curRange.writePos;
              var startPos = chunk.length - chunkLeft;
              var bytesToWrite = Math.min(writeLen, chunkLeft);
              if (exports.debug) logger.debug("Writing bytesToWrite(" + bytesToWrite + ") curBuf writelen(" + writeLen + ") writePos(" + curRange.writePos + ") chunk startPos(" + startPos + ") chunkLeft(" + chunkLeft + ")");
              chunk.copy(curBuf, curRange.writePos, startPos, startPos + bytesToWrite);
              chunkLeft -= bytesToWrite;
              curRange.writePos += bytesToWrite;
              if (curRange.writePos >= curRange.len) nextRange();
            }
          });
          res.on("end", function() {
            cbPath();
          });
        }).end(); // s3client.get
      }

      function addRowToRanges(row) {
        ranges.push({len:row.len, start:row.offset, end:(row.offset + row.len - 1)});
      }

      // While we're still on one file we'll gather all the ranges.
      async.forEachSeries(rows, function(row, cb) {

        if (row.path != curPath && curPath != "") {
          processPath(function() {
            // Reset our current set and start it up again
            ranges = [];
            curPath = row.path;
            addRowToRanges(row);
            cb();
          });
        } else {
          if (!curPath) curPath = row.path;
          addRowToRanges(row);
          cb();
        }
      }, function(error) {
        if (ranges.length != 0) processPath(function() {
          dal.release(db);
          cbError(error);
        })
      });
    });
  }); // dal.acquire
};

exports.batchSmartAdd = function(entries, callback) {
  //console.log("Batch smart add %d entries", entries.length);
  if (entries.length == 0) return callback(new Error("0 length entries added"));
  var entryIdr = idr.parse(entries[0].idr);
  var basePath = entryIdr.auth + "@" + entryIdr.host;
  var ij = new IJOD(basePath);
  dal.acquire(function(err, db) {
    if(err) return callback(err);

    ij.db = db;

    function handleError(msg) {
      if (exports.debug) {
        console.error("Batch smart add error: %s", msg);
        console.trace();
      }
      dal.release(db);
    }

    var script = ["CREATE TEMPORARY TABLE IF NOT EXISTS batchSmartAdd_" + ij.base + " (idr VARCHAR(255) PRIMARY KEY)", "DELETE FROM batchSmartAdd_" + ij.base, "BEGIN"];
    if (exports.debug) console.log("****************************** BEGIN in batch " + ij.base);
    async.forEachSeries(script, function(scriptSql, cb) {
      if (exports.debug) console.log("Running %s", scriptSql);
      db.query(scriptSql, function(err) {
        cb(err ? err : null);
      });
    }, function(error) {
      if (error) return handleError(error);
      async.forEachSeries(entries, function(entry, cb) {
        if (!entry) return cb();
        db.query("INSERT INTO batchSmartAdd_" + ij.base+ " VALUES(?)", [idr.hash(entry.idr)], function(err) {
          return cb(err);
        });
      }, function(error) {
        if (error) {
          db.query("ROLLBACK", function() {
            handleError(error);
          });
          return;
        }
        if (exports.debug) console.log("*********************************** COMMIT in batch " + ij.base);
        db.query("COMMIT", function(error, rows) {
          if (error) return handleError(error);
          db.query("SELECT idr,hash FROM ijod WHERE ijod.idr IN (SELECT idr FROM batchSmartAdd_" + ij.base + ")", function(error, rows) {
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
                  dal.release(db);
                  callback(error);
                });
                //console.log("Batch done: %d", (Date.now() - t));
              }); // forEachSeries(entries)
            }); // startAddTransaction
          });
        });
      }); // forEachSeries id add
    }); // forEachSeries startup queries
  }); // dal.acquire
};

// utilities to respond to a web request, shared between synclets and push
exports.reqCurrent = function(req, res)
{
    var streaming = (req.query['stream'] == "true");
    var options = {};
    if(req.query['limit']) options.limit = parseInt(req.query['limit']);
    if(req.query['offset']) options.offset = parseInt(req.query['offset']);

    var ctype = streaming ? "application/jsonstream" : "application/json";
    res.writeHead(200, {'content-type' : ctype});
    var first = true;
    this.getAll(options, function(err, item){
        if(err) logger.error(err);
        if(item == null)
        { // all done
            if(!streaming) res.write("]");
            return res.end()
        }
        if(streaming) return res.write(item+'\n');
        if(first)
        {
            first = false;
            return res.write('['+item);
        }
        res.write(','+item);
    });

}
exports.reqID = function(req, res)
{
    this.getOne({id:req.params.id}, function(err, item) {
        if (err) logger.error(err);
        if (!item) return res.send("not found",404);
        res.writeHead(200, {'content-type' : 'application/json'});
        res.end(item);
    });
}

// Takes a complete changeset breaks it down by base and saves it to S3
exports.pump = function(arg, cbDone) {
  if(!arg || !Array.isArray) return cbDone(new Error("arg is missing or invalid: "+JSON.stringify(arg)));
  // XXX: Is this actually an error?
  if (arg.length == 0) return cbDone();

  // We use the first entry to derive a base save path for the user
  exports.batchSmartAdd(arg, function(error) {
    cbDone(error ? error : null, error ? null : arg);
  });
};

// make a string and return only the interior data object!
function stripper(buf)
{
    var s = buf.toString("utf8");
    return s.slice(s.indexOf('{',1),s.lastIndexOf('}',s.length-3)+1); // -3 accounts for }\n
}
