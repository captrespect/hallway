var lconfig = require("lconfig");
var dal = require('dal');
var logger = require('logger').logger("profileManager");

exports.init = function(callback) {
  var creates = [
    "CREATE TABLE IF NOT EXISTS Profiles (id VARCHAR(255) PRIMARY KEY, service VARCHAR(32), auth TEXT, config TEXT, `cat` TIMESTAMP  NULL  DEFAULT CURRENT_TIMESTAMP)"
  ];
  dal.bQuery(creates, function(err){
    if(err) logger.error("profiles init failed! ",err);
    callback(err);
  });
}

// generically get a JSON object for a profile, and make sure the row exists
function genGet(fields, id, callback) {
  var q = dal.query("SELECT "+fields.join(",")+" FROM Profiles WHERE id = ? LIMIT 1", [id], function(err, rows) {
    if(err) logger.warn(err,q);
    var ret = {};
    // parse each field returned into an object
    if(rows && rows.length == 1) for(var i = 0; i < fields.length; i++) try {
      ret[fields[i]] = JSON.parse(rows[0][fields[i]]);
    } catch(E) {
      ret[fields[i]] = {}; // ensure a blank exists at least
      logger.warn("failed to process Profile."+fields[i]+": ",E);
    };
    if(rows && rows.length == 1) return callback(err, ret);

    // catch if there's no entry yet and make sure there is one so that UPDATE syntax works!
    var parts = id.split('@');
    var q = dal.query("INSERT INTO Profiles (id, service) VALUES (?, ?)", [id, parts[1]], function(err2) {
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
exports.authGet = function(id, app, callback) { genGet(['auth'], id, function(err, obj){
  if(err || !obj || !obj.auth) return callback(err);
  // if no app-specific auth
  var auth = obj.auth;
  if(!app || !auth.apps || !auth.apps[app]) return callback(null, auth);
  // merge up the app stuff and return it!
  Object.keys(auth.apps[app]).forEach(function(key){
    auth[key] = auth.apps[app][key];
  });
  callback(null, auth);
})}

// do magic to store auth per app when given
exports.authSet = function(id, js, app, callback) {
  genGet(['auth'], id, function(err, old) {
    if(err) return callback(err);
    var val;
    if(!app || !old.auth || Object.keys(old.auth).length == 0) // no app, or no old object just merge the top level objects
    {
      if(!old.auth) old.auth = {};
      // WARNING, this is a dumb merge! just flat replace keys
      Object.keys(js).forEach(function(key){
        old.auth[key] = js[key];
      });
      js = old.auth;
    }
    if(app){
      // always store an app's stuff in it's own key, stripped down, this is really ugly but we don't know what other keys are there
      var copy = JSON.parse(JSON.stringify(js));
      delete copy.profile;
      delete copy.pid;
      delete copy.apps;
      copy.at = Date.now();
      if(!js.apps) js.apps = {};
      js.apps[app] = copy;
    }
    var q = dal.query("UPDATE Profiles SET `auth` = ? WHERE id = ?", [JSON.stringify(js), id], function(err){
      if(err) logger.error("query failed: ",q, err);
      callback(err);
    });
  });
}

exports.configGet = function(id, callback) { genGet(['config'], id, function(err, obj){ callback(err, obj && obj.config) }) }
exports.configSet = function(id, js, callback) { genSet('config', id, js, callback) }
exports.allGet = function(id, callback) { genGet(['config', 'auth'], id, callback) }

exports.reset = function(id, callback) {
  dal.query("UPDATE Profiles set config='{}' WHERE id=?", [id], callback);
};

