var lconfig = require("lconfig");
var dal = require('dal');
var logger = require('logger').logger("profileManager");

exports.init = function(callback) {
  var creates = [
    "CREATE TABLE IF NOT EXISTS Profiles (id VARCHAR(255) PRIMARY KEY, service VARCHAR(32), worker VARCHAR(32), auth TEXT, config TEXT)"
  ];
  dal.bQuery(creates, function(err){
    if(err) logger.error("profiles init failed! ",err);
    callback(err);
  });
}

// generically get a JSON object for a profile, and make sure the row exists
function genGet(fields, id, callback) {
  var q = dal.query("SELECT "+fields.join(",")+" FROM Profiles WHERE id = ? LIMIT 1", [id], function(err, rows) {
    if(err || !rows) logger.error("now rows or error ",err,q);
    rows = (rows && rows.length > 0) ? rows : [{}]; // ensure at least a blank row since we process it below
    var ret = {};
    // parse each field returned into an object
    for(var i = 0; i < fields.length; i++) if(rows[0][fields[i]] && rows[0][fields[i]].substr(0,1) == "{") try {
      ret[fields[i]] = JSON.parse(rows[0][fields[i]]);
    } catch(E) {
      ret[fields[i]] = {}; // ensure a blank exists at least
      logger.error("failed to process Profile."+fields[i]+": ",E);
    };
    if(rows.length == 1) return callback(err, ret);

    // catch if there's no entry yet and make sure there is one so that UPDATE syntax works!
    var parts = id.split('@');
    var q = dal.query("INSERT INTO Profiles (id, service, worker) VALUES (?, ?, ?)", [id, parts[1], lconfig.workerName], function(err2) {
      if(err2) logger.error("query failed: ",q, err2);
      callback(err, ret); // return original now
    })
  });
}

// generically merge update a JSON object for a profile
function genSet(field, id, val, callback) {
  genGet([field], id, function(err, old) {
    if(err) return callback(err);
    if(typeof val == 'object')
    {
      if(!old[field]) old[field] = {};
      // WARNING, this is a dumb merge! just flat replace keys
      Object.keys(val).forEach(function(key){
        old[field][key] = val[key];
      });
      val = JSON.stringify(old[field]);
    }
    var q = dal.query("UPDATE Profiles SET `"+field+"` = ? WHERE id = ?", [val, id], function(err){
      if(err) logger.error("query failed: ",q, err);
      callback(err);
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

exports.reset = function(id, callback) {
  dal.query("UPDATE Profiles set config='{}' WHERE id=?", [id], callback);
};

