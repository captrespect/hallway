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

exports.debug = true;

exports.initDB = function(callback) {
  dal.bQuery(["CREATE TABLE IF NOT EXISTS ijod (idr VARCHAR(32) NOT NULL, base VARCHAR(32), path VARCHAR(255), hash VARCHAR(32), at BIGINT, offset INT, len INT, PRIMARY KEY(idr))"], function(err) {
    callback(err);
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
        //if (exports.debug) logger.debug("****************************** COMMIT in normal " + self.base);
        self.transactionItems = null;
        //self.db.query("COMMIT", function(error, rows) { cbDone(); });
        cbDone();
      } else {
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
  arg.idr = idr.toString(arg.idr);
  var self = this;
  this.startAddTransaction(function() {
    var tmpJson = JSON.stringify(arg);
    var gzdata = zlib.compress(new Buffer(tmpJson+"\n"));
    self.transactionItems.push(gzdata);
    var offset = self.len;
    self.len += gzdata.length;
    dal.query("INSERT INTO ijod VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE path=VALUES(path), hash=VALUES(hash), at=VALUES(at), offset=VALUES(offset), len=VALUES(len)", [idr.hash(arg.idr), idr.baseHash(arg.idr), self.path, hash, arg.at, offset, (self.len - offset)], callback);
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
  var s3client = knox.createClient({
    key:lconfig.s3.key,
    secret:lconfig.s3.secret,
    bucket:lconfig.s3.bucket
  });
  var self = this;
  // take the raw id if given too
  var hash = (targetIdr.length == 32 && targetIdr.indexOf(':') == -1) ? targetIdr : idr.hash(targetIdr);
  dal.query("SELECT path, offset, len FROM ijod WHERE idr = ? LIMIT 1", [hash], function(error, rows) {
    if (error) return callback(error);
    if (rows.length != 1) return callback(new Error("Bad query for getOne"));

    var buf = new Buffer(rows[0].len);
    var appendPos = 0;
    if (exports.debug) logger.debug("%s - Range: bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1), rows[0].path);
    var req = s3client.get(rows[0].path, {
      "Range":"bytes=" + rows[0].offset + "-" + (rows[0].offset + rows[0].len - 1),
      "Content-Type":"x-ijod/gz"
    }).on("response", function(res) {
      res.on("data", function(chunk) {
        chunk.copy(buf, appendPos);
        appendPos += chunk.length;
      });
      res.on("end", function() {
        var data = JSON.parse(zlib.uncompress(buf).toString());
        callback(null, data);
      });
    }).end(); // s3client.get
  });
};

/// Select a time based range of IJOD entries.
/**
* range is optional and will default to all entries, when supplied it should 
* have start and end values.  The range is inclusive.
*
* Results are returned in reverse chronological order.
*/
exports.getRange = function(basePath, range, cbEach, cbDone) {
  var s3client = knox.createClient({
    key:lconfig.s3.key,
    secret:lconfig.s3.secret,
    bucket:lconfig.s3.bucket
  });
  var self = this;

  var sql = "SELECT path, offset, len FROM ijod WHERE base = ?";
  var binds = [mmh.murmur128HexSync(basePath)];
  if (range && range.start && range.end) {
    sql += " AND (at >= ? AND at <= ?)";
    binds.push(range.start);
    binds.push(range.end);
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

    var curPath = "";
    var ranges = [];

    // Process the curPath
    function processPath(cbPath) {
      if (ranges.length == 0) cbPath();

      if (exports.debug) logger.debug(JSON.stringify(ranges));
      
      // Find the extents and create a range string
      var start = ranges[0].start;
      var end = ranges[0].end;

      ranges.forEach(function(range) {
        if (range.start < start) start = range.start;
        if (range.end > end) end = range.end;
      });
      // Shift the offsets if we're not 0 based anymore
      if (start > 0) {
        ranges.forEach(function(range) {
          range.start -= start;
          range.end -= start;
        });
      }
      var rangeStr = "bytes=" + start + "-" + end;

      if (exports.debug) logger.debug("Ranges: " + rangeStr);
      var req = s3client.get(curPath, {
        "Range":rangeStr,
        "Content-Type":"x-ijod/gz"
      }).on("response", function(res) {
        if (exports.debug) {
          logger.debug(res.statusCode);
          logger.debug(res.headers);
        }

        if (res.statusCode > 206) {
          return cbPath(new Error("There was an error retrieving the data."));
        }

        var fullBuffer = new Buffer(end - start);
        var fullBufWritePos = 0;
        res.on("data", function(chunk) {
          chunk.copy(fullBuffer, fullBufWritePos);
          fullBufWritePos += chunk.length;
        });
        res.on("end", function() {
          ranges.forEach(function(range) {
            var curBuf = fullBuffer.slice(range.start, range.end);
            fs.writeFileSync("chunk.gz", curBuf);
            var decompressed = zlib.uncompress(curBuf);
            cbEach(JSON.parse(decompressed.toString()));
          });
          cbPath();
        });
      }).end(); // s3client.get
    }

    function addRowToRanges(row) {
      ranges.push({len:row.len, start:row.offset, end:(row.offset + row.len)});
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
        return cbDone(error);
      })
    });
  });
};

exports.batchSmartAdd = function(entries, callback) {
  //console.log("Batch smart add %d entries", entries.length);
  if (entries.length == 0) return callback(new Error("0 length entries added"));
  var entryIdr = idr.parse(entries[0].idr);
  var basePath = entryIdr.auth + "@" + entryIdr.host;
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
