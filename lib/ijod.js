/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

/*

CREATE TABLE `Entries` (
  `base` binary(24) NOT NULL,
  `idr` binary(16) NOT NULL,
  `path` varchar(128) DEFAULT NULL,
  `hash` varchar(32) DEFAULT NULL,
  `offset` int(11) DEFAULT NULL,
  `len` int(11) DEFAULT NULL,
  `lat` decimal(8,5) DEFAULT NULL,
  `lng` decimal(8,5) DEFAULT NULL,
  `q0` bigint(20) unsigned DEFAULT NULL,
  `q1` bigint(20) unsigned DEFAULT NULL,
  `q2` bigint(20) unsigned DEFAULT NULL,
  `q3` bigint(20) unsigned DEFAULT NULL,
  `par` varbinary(16) DEFAULT NULL,
  PRIMARY KEY (`base`),
  UNIQUE KEY `idr_index` (`idr`)
) ENGINE=XtraDB DEFAULT CHARSET=utf8;

insert ignore into Entries (base, idr, path, hash, offset, len, lat, lng, q0, q1, q2, q3) select unhex(substr(concat(rpad(binary base,32,'0'), lpad(hex(floor(at/1000)),8,'0'), lpad(hex(conv(substr(idr,1,8),16,10)+(at - (floor(at/1000)*1000))),8,'0')),1,48)), unhex(idr), path, hash, offset, len, lat, lng, q0, q1, q2, q3 from ijod

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
var qix = require('qix');

exports.debug = lconfig.debug;

exports.initDB = function(callback) {
  memcache = memcachelib.memcacheClient();

  logger.info('Connecting to memcache...');

  memcache.connect(function() {
    logger.info("Connected to memcache");

    callback();
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
          if(error) logger.error(error)
          instruments.timing({"ijod.save_time":(Date.now() - startTime)}).send();
          instruments.increment("ijod.puts").send();
          //if (exports.debug) logger.debug("****************************** COMMIT in normal " + self.base);
          self.transactionItems = null;
          //self.db.query("COMMIT", function(error, rows) { cbDone(); });
          cbDone(error);
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
  // build our query matching
  var q = qget(arg)
  var qx = [null,null,null,null];
  var buf = qix.buf(q);
  if(exports.debug) logger.debug("Q",arg.idr,q,buf&&buf.toString('hex'));
  var qsql = "?, ?, ?, ?";
  if(buf)
  {
    qsql = "x?, x?, x?, x?";
    qx[0] = buf.slice(0,8).toString('hex');
    qx[1] = buf.slice(8,16).toString('hex');
    qx[2] = buf.slice(16,24).toString('hex');
    qx[3] = buf.slice(24).toString('hex');
  }
  // build our participant matching binary string
  var par = null;
  var participants = parget(arg);
  if(participants.length > 0)
  {
    qsql += ', x?';
    var owner = idr.parse(arg.idr).auth;
    par = '';
    participants.forEach(function(part){
      // owner is special to optimize for worst case overlaps, everyone else is 1-254, 0 is reserved
      par += (part == owner) ? 'ff' : par2hex(part);
    });
  }else{
    qsql += ', ?';
  }
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
    var sql = "INSERT INTO Entries (base, idr, path, hash, offset, len, lat, lng, q0, q1, q2, q3, par) VALUES (unhex(concat(rpad(?,32,'0'), lpad(hex(floor(?/1000)),8,'0'), lpad(hex(conv(substr(?,1,8),16,10)+(? - (floor(?/1000)*1000))),8,'0'))), unhex(?), ?, ?, ?, ?, ?, ?, "+qsql+") ON DUPLICATE KEY UPDATE path=VALUES(path), hash=VALUES(hash), offset=VALUES(offset), len=VALUES(len), lat=VALUES(lat), lng=VALUES(lng), q0=VALUES(q0), q1=VALUES(q1), q2=VALUES(q2), q3=VALUES(q3), par=VALUES(par)";
    self.transactionQueries.push({sql:sql, binds:[idr.baseHash(arg.idr), arg.at, idr.hash(arg.idr), arg.at, arg.at, idr.hash(arg.idr), self.path, hash, offset, (self.len - offset), ll[0], ll[1], qx[0], qx[1], qx[2], qx[3], par]});
    // if there's types, insert each of them too for filtering
    if(!arg.data || !arg.types) return callback();
    async.forEachSeries(Object.keys(arg.types), function(type, cb){
      var i2 = idr.clone(arg.idr);
      i2.protocol = type;
      instruments.increment("data.types." + type).send();
      if(typeof arg.types[type] == 'object' && arg.types[type].auth) i2.auth = arg.types[type].auth; // also index this with a different auth!
      self.transactionQueries.push({sql:sql, binds:[idr.baseHash(i2), arg.at, idr.hash(i2), arg.at, arg.at, idr.hash(i2), self.path, hash, offset, (self.len - offset), ll[0], ll[1], qx[0], qx[1], qx[2], qx[3], par]});
      cb();
    }, callback);
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
      dal.query("SELECT path, offset, len FROM Entries WHERE idr = x? LIMIT 1", [hash], function(error, rows) {
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
  var sql = "SELECT path, offset, len FROM Entries WHERE base > unhex(concat(rpad(?,32,'0'), lpad(hex(floor(?/1000)),8,'0'),'00000000')) AND base < unhex(concat(rpad(?,32,'0'),lpad(hex(floor(?/1000)),8,'0'),'ffffffff'))";
  var binds = [mmh.murmur128HexSync(basePath), range.since||0, mmh.murmur128HexSync(basePath), range.until||Date.now()];
  if (range.box) {
    sql += " AND lat > ? AND lat < ? AND lng > ? and lng < ?";
    range.box.lat.sort(function(a,b){return a-b});
    range.box.lng.sort(function(a,b){return a-b});
    binds.push(range.box.lat[0], range.box.lat[1], range.box.lng[0], range.box.lng[1]);
  }
  sql += qq(range.q);
  sql += parq(range.participants);
  sql += " ORDER BY base DESC";
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
    rows.forEach(function(row) {

      if (paths.length == 0 || row.path != paths[paths.length - 1].path) {
        paths.push({ranges:[], path:row.path});
      }
      addRowToRanges(row, paths[paths.length - 1].ranges);
    });

    async.map(paths, processPath, function(error, results) {
      for (var i = 0; i < results.length; ++i) {
        if (!results[i]) continue;
        for (var j = 0; j < results[i].length; ++j) {
          // make sure q matches, must be same as above (TODO cleanup as part of refactor)
          if(range.q)
          {
            var q = qix.chunk(qget(results[i][j]));
            var parts = qix.chunk(range.q);
            var matches = 0;
            parts.forEach(function(part){if(q.indexOf(part) >= 0) matches++ });
            if(matches != parts.length)
            {
              logger.warn("couldn't find QUERY ",parts.join(','),"in",q.join(','));
              continue;
            }
          }
          if(parq(range.participants).length > 0)
          {
            var pquery = range.participants.split(",");
            var pentry = parget(results[i][j]);
            var matches = 0;
            pquery.forEach(function(par){if(par == "self" || par.indexOf(">") == 0 || pentry.indexOf(par) >= 0) matches++ });
            if(matches != pquery.length)
            {
              logger.warn("couldn't find PARTICIPANTS ",pquery.join(','),"in",pentry.join(','));
              continue;
            }            
          }
          cbEach(results[i][j]);
        }
      }
      if (exports.debug) logger.debug("Range run time: %d", (Date.now() - startRangeTime));
      return cbDone(error);
    });
  });
};

exports.batchSmartAdd = function(entries, callback) {
  if (entries.length == 0) return callback(new Error("0 length entries added"));
  var basePath = idr.pid(entries[0].idr);
  var ij = new IJOD(basePath);
  logger.debug("Batch smart add", basePath, entries.length);

  function handleError(msg) {
    if (exports.debug) {
      logger.error("Batch smart add error: %s", msg);
      logger.trace();
    }
  }

  var entryInClause = entries.map(function(entry) { return "x'" + idr.hash(entry.idr) + "'"; }).join(",");
  if (exports.debug) logger.debug("SELECT idr,hash FROM Entries WHERE idr IN (" +  entryInClause + ")");
  dal.query("SELECT hex(idr) as idr, hash FROM Entries WHERE idr IN (" +  entryInClause + ")", [], function(error, rows) {
    if (error) return handleError(error);
    var knownIds = {};
    rows = rows || [];
    rows.forEach(function(row) { 
      knownIds[row.idr.toLowerCase()] = row.hash;
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
        ij.addData(entry, function() { async.nextTick(cb); });
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
  // gotta use a subquery to get the actual limit applied!
  var since = (range && range.since) ? range.since : 0;
  var until = (range && range.until) ? range.until : Date.now();
  var sql = "SELECT MAX(at) as newest, MIN(at) as oldest, COUNT(*) as total FROM (SELECT conv(hex(substr(base,17,4)),16,10) as at FROM Entries WHERE base > unhex(concat(rpad(?,32,'0'), lpad(hex(floor(?/1000)),8,'0'),'00000000')) AND base < unhex(concat(rpad(?,32,'0'),lpad(hex(floor(?/1000)),8,'0'),'ffffffff'))";
  var binds = [mmh.murmur128HexSync(basePath), since, mmh.murmur128HexSync(basePath), until];
  if (range && range.box) {
    sql += " AND lat > ? AND lat < ? AND lng > ? and lng < ?";
    range.box.lat.sort(function(a,b){return a-b});
    range.box.lng.sort(function(a,b){return a-b});
    binds.push(range.box.lat[0], range.box.lat[1], range.box.lng[0], range.box.lng[1]);
  }
  sql += qq(range.q);
  sql += parq(range.participants);
  sql += ") AS sq1";
  if (exports.debug)  logger.debug("SQL: ",sql,"Binds: ",JSON.stringify(binds));
  dal.query(sql, binds, function(error, rows) {
    if (error) return cbDone(error);
    if (rows.length == 0) return cbDone(null);
    cbDone(null,rows[0]);
  });
}

function qq(q)
{
  if(!q) return "";
  var buf = qix.buf(q);
  if(!buf) return "";
  var ret = "";
  for(var i = 0; i < 4; i++)
  {
    var hex = (i < 3) ? buf.slice(i*8,(i*8)+8).toString('hex') : buf.slice(24).toString('hex');
    ret += " AND q"+i+" & x'"+hex+"' = x'"+hex+"'";
  }
  return ret;
}

function qget(entry)
{
  var oe = dMap.get('oembed', entry.data, entry.idr) || {};
  return [entry.q, (oe.type=='link')?oe.url:'', oe.title, oe.author_name, dMap.get('text', entry.data, entry.idr)].join(" "); // get all queryable strings
}
exports.qtext = qget;

function par2hex(part)
{
  var ret = ((parseInt(mmh3.murmur32HexSync(part),16) % 254)+1).toString(16);
  return (ret.length == 1) ? '0'+ret : ret;
}

function parq(participants)
{
  if(!participants) return "";
  var parts = participants.split(',');
  if(parts.length == 0) return "";
  var ret = "";
  parts.forEach(function(part){
    if(part.indexOf(">") == 0)
    {
      var amt = parseInt(part.substr(1));
      if(amt > 0) ret += " AND LENGTH(par) > "+amt;
      return;
    }
    var hex = (part == 'self') ? 'ff' : par2hex(part);
    ret += " AND INSTR(par, x'"+hex+"') > 0";
  });
  return ret;
}

// extract participant array with author at first
function parget(entry)
{
  var ret = [];
  var author = idr.parse(entry.idr).auth;
  var dparts = dMap.get('participants', entry.data, entry.idr);
  if(dparts) Object.keys(dparts).forEach(function(id){
    if(dparts[id].author) {
      author = id.toString();
      return;
    }
    ret.push(id.toString());
  });
  ret.unshift(author);
  return ret;
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
  logger.debug("pumping",Object.keys(bases).join(" "))
  async.forEach(Object.keys(bases), function(base, cb){
    exports.batchSmartAdd(bases[base], function(error) {
      if (error) return cb(error);
      async.nextTick(cb);
    });
  }, function(error){
    logger.debug("pump done",Object.keys(bases),error);
    cbDone(error ? error : null, error ? null : arg);    
  });
};

// make a string and return only the interior data object!
function stripper(buf)
{
    var s = buf.toString("utf8");
    return s.slice(s.indexOf('{',1),s.lastIndexOf('}',s.length-3)+1); // -3 accounts for }\n
}
