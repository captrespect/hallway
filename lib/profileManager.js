var lconfig = require("lconfig");
var dal = require('dal');
var lutil = require('lutil');

exports.init = function(callback) {
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    var creates = [
      "CREATE TABLE IF NOT EXISTS Profiles (id VARCHAR(255) PRIMARY KEY, service VARCHAR(32), worker VARCHAR(32), auth TEXT, config TEXT)"
    ];
    dal.bQuery(db, creates, function(err){
      dal.release(db);
      if(err) console.error("profiles init failed! ",err);
      callback(err);
    });
  });
}

// generically get a JSON object for a profile, and make sure the row exists
function genGet(fields, id, callback) {
  dal.acquire(function(err, db) {
    if(err) return callback(err);
    db.query("SELECT "+fields.join(",")+" FROM Profiles WHERE id = ? LIMIT 1", [id], function(err, rows) {
      rows = rows || [];
      dal.release(db);
      var ret = {};
      // parse each field returned into an object
      for(var i = 0; rows[0] && i < fields.length; i++) try {
        ret[fields[i]] = JSON.parse(rows[0][fields[i]]);
      } catch(E) {
        ret[fields[i]] = {}; // ensure a blank exists at least
        console.error("failed to process Profile."+fields[i]+": ",E);
      };
      if(rows.length == 1) return callback(err, ret);

      // catch if there's no entry yet and make sure there is one so that UPDATE syntax works!
      var parts = id.split('@');
      var q = db.query("INSERT INTO Profiles (id, service, worker) VALUES (?, ?, ?)", [id, parts[1], lconfig.workerName], function(err2) {
        if(err2) console.error("query failed: "+q.sql+" ", err2);
        callback(err, ret); // return original now
      })
    });
  });
}

// generically merge update a JSON object for a profile
function genSet(field, id, val, callback) {
  genGet([field], id, function(err, old) {
    if(err) return callback(err);
    if(typeof val == 'object')
    {
      // WARNING, this merge will replace arrays, and old data never goes away, prob need something smarter someday
      val = JSON.stringify(lutil.extend(true, old[field], val));
    }
    dal.acquire(function(err, db) {
      if(err) return callback(err);
      var q = db.query("UPDATE Profiles SET `"+field+"` = ? WHERE id = ?", [val, id], function(err){
        dal.release(db);
        if(err) console.error("query failed: "+q.sql+" ", err);
        callback(err);
      });
    });
  });
}

// get/set the stored auth/config info if any
exports.authGet = function(id, callback) { genGet(['auth'], id, function(err, obj){ callback(err, obj && obj.auth) }) }
exports.authSet = function(id, js, callback) { genSet('auth', id, js, callback) }
exports.configGet = function(id, callback) { genGet(['config'], id, function(err, obj){ callback(err, obj && obj.config) }) }
exports.configSet = function(id, js, callback) { genSet('config', id, js, callback) }
exports.workerSet = function(id, worker, callback) { genSet('worker', id, worker, callback) }
exports.allGet = function(id, callback) { genGet(['config', 'auth'], id, callback) }


