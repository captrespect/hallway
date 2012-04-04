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

exports.initDB = function(db, cbDone) {
  // XXX: This could be a composite primary key on entry_id, object
  db.query("CREATE TABLE IF NOT EXISTS ijod (id INT UNSIGNED NOT NULL AUTO_INCREMENT, entry_id VARCHAR(255), object VARCHAR(255), at INT, len INT, hash TEXT, PRIMARY KEY(id));", cbDone);
}

function IJOD(arg) {
  if(!arg || !arg.name) throw new Error("invalid args");
  var self = this;
  this.transactionItems = null;
  self.path = path.join(arg.name, "ijod." + Date.now());
  self.name = arg.name;
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
  console.log("****************************** BEGIN in normal " + this.name);
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
      self.transactionItems = null;
      // We end the transaction
      if (res.statusCode == 200) {
        console.log("****************************** COMMIT in normal " + self.name);
        self.db.query("COMMIT", function(error, rows) { cbDone(); });
      } else {
        console.error("*************** GIANT ERROR WRITING TO S3 FOR IJOD");
        res.on("data", function(data) {
          console.error(data.toString());
        });
        console.dir(res);
        self.db.query("ROLLBACK", function(error, rows) { cbDone(); });
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
  this.db.query("ROLLBACK TRANSACTION", function(error, rows) { cbDone(); });
};

// takes arg of at least an id and data, callback(err) when done
IJOD.prototype.addData = function(arg, callback) {
  if(!arg || !arg.id) return callback("invalid arg");
  arg.id = arg.id.toString(); // safety w/ numbers
  var tmpJson = JSON.stringify(arg);
  var hash = arg.hash ? arg.hash : mmh3.murmur32HexSync(tmpJson);
  delete arg.hash;
  if(!arg.at) arg.at = Date.now();
  var self = this;
  this.startAddTransaction(function() {
    var tmpJson = JSON.stringify(arg);
    var gzdata = zlib.compress(new Buffer(tmpJson+"\n"));
    self.transactionItems.push(gzdata);
    var at = self.len;
    self.len += gzdata.length;
    self.db.query("REPLACE INTO ijod VALUES (0, ?, ?, ?, ?, ?)", [arg.id, self.path, at, (self.len - at), hash], callback);
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

exports.getOne = function(arg, callback) {
  if(!arg || !arg.id) return callback("invalid arg");
  arg.id = arg.id.toString(); // safety w/ numbers
  var self = this;
  var did = false;
  var res = self.db.query("SELECT object,at,len FROM ijod WHERE entry_id = ? LIMIT 1", [arg.id]);
  res.on("error", function(err) {
    callback(err);
  });
  res.on("row", function(row) {
    did = true;
    var buf = new Buffer(row.len);
    var appendPos = 0;
    self.s3client.get(row.object).on("response", function(res) {
      res.on("data", function(chunk) {
        chunk.copy(buf, appendPos);
        appendPos += chunk.length;
      });
      res.on("end", function() {
        var data = zlib.uncompress(buf);
        callback(err, arg.raw ? data : stripper(data));
      });
    });
  });
  res.on("end", function() {
    if (!did) callback();
  });
};

// this only calls callback(err, rawstring) once!
IJOD.prototype.getOne = function(arg, callback) {
}

/* TODO
// will call callback(err, rawstring) continuously until rawstring==undefined
IJOD.prototype.getAll = function(arg, callback) {
  if(!arg) return callback("invalid arg");
  var params = [];
  var sql = "SELECT at,len FROM ijod ";
  if(arg.limit)
  {
    sql += " LIMIT ?";
    params.push(parseInt(arg.limit));
  }
  if(arg.offset)
  {
    sql += " OFFSET ?";
    params.push(parseInt(arg.offset));
  }
  var self = this;
  self.db.query(sql, params, function(err, row){
    if(err) return callback(err);
    if(!row) return callback();
    var buf = new Buffer(row.len);
    fs.readSync(self.fdr, buf, 0, row.len, row.at);
    var data = zlib.uncompress(buf);
    return callback(err, arg.raw ? data : stripper(data));
  });
}
*/

IJOD.prototype.batchSmartAdd = function(entries, callback) {
  //console.log("Batch smart add %d entries", entries.length);
  var t = Date.now();
  var self = this;
  dal.acquire(function(err, db) {
    if(err) return callback(err);

    self.db = db;

    function handleError(msg) {
      console.error("Batch smart add error: %s", msg);
      console.trace();
      dal.release(db);
    }

    var script = ["CREATE TEMPORARY TABLE IF NOT EXISTS batchSmartAdd (id VARCHAR(255), object VARCHAR(255))", "DELETE FROM batchSmartAdd", "BEGIN"];
    console.log("****************************** BEGIN in batch " + self.name);
    async.forEachSeries(script, function(scriptSql, cb) {
      console.log("Running %s", scriptSql);
      db.query(scriptSql, function(err) {
        cb(err ? err : null);
      });
    }, function(error) {
      if (error) return handleError(error);
      async.forEachSeries(entries, function(entry, cb) {
        if (!entry) return cb();

        db.query("INSERT INTO batchSmartAdd VALUES(?, ?)", [entry.id, self.path], function(err) {
          return cb(err);
        });
      }, function(error) {
        if (error) return handleError(error);
        console.log("*********************************** COMMIT in batch " + self.name);
        db.query("COMMIT", function(error, rows) {
          if (error) return handleError(error);
          db.query("SELECT entry_id,hash FROM ijod WHERE ijod.entry_id IN (SELECT id FROM batchSmartAdd WHERE object=?)", [self.path], function(error, rows) {
            if (error) return handleError(error);
            var knownIds = {};
            rows = rows || [];
            rows.forEach(function(row) { 
              knownIds[row.id] = row.hash;
            });
            self.startAddTransaction(function() {
              async.forEachSeries(entries, function(entry, cb) {
                if (!entry) return cb();
                if (knownIds[entry.id]) {
                  // See if we need to update
                  entry.id = entry.id.toString(); // safety w/ numbers
                  var hash = mmh3.murmur32HexSync(JSON.stringify(entry));
                  // If the id and hashes match it's the same!
                  if (hash == knownIds[entry.id]) {
                    return cb();
                  } else {
                    entry.hash = hash;
                  }
                } 
                self.addData(entry, cb);
              }, function(error) {
                if (error) return handleError(error);
                self.batchAttempt = 0;
                self.commitAddTransaction(callback);
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
IJOD.prototype.reqCurrent = function(req, res)
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
IJOD.prototype.reqID = function(req, res)
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
