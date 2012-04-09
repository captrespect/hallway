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

exports.initDB = function(db, cbDone) {
  db.query("CREATE TABLE IF NOT EXISTS ijod (idr VARCHAR(32) NOT NULL, base VARCHAR(32), path VARCHAR(255), hash VARCHAR(32), at BIGINT, offset INT, len INT, PRIMARY KEY(idr))", cbDone);
}

function IJOD(baseIdr) {
  var self = this;
  this.transactionItems = null;
  self.base = idr.baseHash(baseIdr);
  self.path = path.join(self.base, "ijod." + Date.now());
  self.baseIdr = baseIdr;
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
  console.log("****************************** BEGIN in normal " + this.base);
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
        console.log("****************************** COMMIT in normal " + self.base);
        self.transactionItems = null;
        self.db.query("COMMIT", function(error, rows) { cbDone(); });
      } else {
        console.error("*************** GIANT ERROR WRITING TO S3 FOR IJOD");
        res.on("data", function(data) {
          console.error(data.toString());
        });
        console.dir(res);
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
  if(!arg || !arg.id) return callback("invalid arg");
  arg.id = arg.id.toString(); // safety w/ numbers
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
    var entryIdr = idr.clone(self.baseIdr);
    entryIdr.hash = arg.id;
    self.db.query("REPLACE INTO ijod VALUES (?, ?, ?, ?, ?, ?, ?)", [idr.hash(entryIdr), self.base, self.path, hash, arg.at, offset, (self.len - offset)], callback);
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
    console.dir(targetIdr);
    console.log(idr.hash(targetIdr));
    db.query("SELECT path, offset, len FROM ijod WHERE idr = ? LIMIT 1", [idr.hash(targetIdr)], function(error, rows) {
      if (error) return cbError(error);
      if (rows.length != 1) return cbError(new Error("Bad query for getOne"));

      var buf = new Buffer(rows[0].len);
      var appendPos = 0;
      console.log("%s - Range: bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1), rows[0].path);
      var req = s3client.get(rows[0].path, {
        "Range":"bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1),
        "Content-Type":"x-ijod/gz"
      }).on("response", function(res) {
        console.log("Starting");
        res.on("data", function(chunk) {
          console.log("Appending chunk");
          chunk.copy(buf, appendPos);
          appendPos += chunk.length;
        });
        res.on("end", function() {
          console.log("Done");
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
exports.getRange = function(baseIdr, range, cbEach, cbDone) {
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
    var binds = [idr.baseHash(baseIdr)];
    if (range && range.start && range.end) {
      sql += " AND (at >= ? AND end <= ?)";
      binds.push(range.start);
      binds.push(range.end);
    }
    sql += " ORDER BY at";
    db.query(sql, binds, function(error, rows) {
      if (error) return cbError(error);

      var curPath = "";
      var ranges = [];

      // Process the curPath
      function processPath(cbPath) {
        if (ranges.length == 0) cbPath();
        // Gather the ranges, collapsing as we can
        var rangeStr;
        var start = 0;
        var end = -1;
        function appendRange(start, end) {
          if (!rangeStr) {
            rangeStr = "byte=";
          } else {
            rangeStr += ",";
          }
          rangeStr += start + "-" + end;
        }

        ranges.forEach(function(range) {
          if (range.start != end + 1) {
            appendRange(start, end);
            start = range.start;
            end = range.end;
          } else {
            end = range.end;
          }
        });
        appendRange(start, end);
        var req = s3client.get(curPath, {
          "Range":rangeStr,
          "Content-Type":"x-ijod/gz"
        }).on("response", function(res) {
          var curRange;
          var curBuf;
          function nextRange() {
            if (curBuf) {
              cbEach(JSON.parse(zlib.uncompress(curBuf).toString()));
            }
            curRange = ranges.shift();
            if (!curRange) return;
            curRange.writePos = 0;
            curBuf = new Buffer(curRange.len);
          }
          nextRange();
          res.on("data", function(chunk) {
            var chunkLeft = chunk.length;
            while (curRange && chunkLeft > 0){
              var writeLen = curRange.len - curRange.writePos;
              var startPos = chunk.length - chunkLeft;
              if (chunkLeft > writeLen) {
                chunk.copy(curBuf, curRange.writePos, startPos, startPos + writeLen);
                chunkLeft -= writeLen;
                nextRange();
              } else {
                chunk.copy(curBuf, curRange.writePos, startPos, startPos + chunkLeft);
                curRange.writePos += chunkLeft;
                chunkLeft = 0;
                if (curRange.writePos >= curRange.len) nextRange();
              }
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
      async.forEach(rows, function(row, cb) {

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
          cbDone(error);
        })
      });
    });
  }); // dal.acquire
};

exports.batchSmartAdd = function(baseIdr, entries, callback) {
  //console.log("Batch smart add %d entries", entries.length);
  var ij = new IJOD(baseIdr);
  dal.acquire(function(err, db) {
    if(err) return callback(err);

    ij.db = db;

    function handleError(msg) {
      console.error("Batch smart add error: %s", msg);
      console.trace();
      dal.release(db);
    }

    var script = ["CREATE TEMPORARY TABLE IF NOT EXISTS batchSmartAdd_" + ij.base + " (idr VARCHAR(255) PRIMARY KEY)", "DELETE FROM batchSmartAdd_" + ij.base, "BEGIN"];
    console.log("****************************** BEGIN in batch " + ij.base);
    async.forEachSeries(script, function(scriptSql, cb) {
      console.log("Running %s", scriptSql);
      db.query(scriptSql, function(err) {
        cb(err ? err : null);
      });
    }, function(error) {
      if (error) return handleError(error);
      var entryIdr = idr.clone(baseIdr);
      async.forEachSeries(entries, function(entry, cb) {
        if (!entry) return cb();
        entryIdr.hash = entry.id.toString();
        db.query("INSERT INTO batchSmartAdd_" + ij.base+ " VALUES(?)", [idr.hash(entryIdr)], function(err) {
          return cb(err);
        });
      }, function(error) {
        if (error) return handleError(error);
        console.log("*********************************** COMMIT in batch " + ij.base);
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
                entryIdr.hash = entry.id.toString();
                var entryIdrHash = idr.hash(entryIdr);
                if (knownIds[entryIdrHash]) {
                  // See if we need to update
                  entry.id = entry.id.toString(); // safety w/ numbers
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
                if (error) return handleError(error);
                ij.commitAddTransaction(callback);
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

// make a string and return only the interior data object!
function stripper(buf)
{
    var s = buf.toString("utf8");
    return s.slice(s.indexOf('{',1),s.lastIndexOf('}',s.length-3)+1); // -3 accounts for }\n
}
