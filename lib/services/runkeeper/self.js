var request = require('request');

exports.sync = function(pi, cb) {
  var headers = {};
  headers["Authorization"] = "Bearer "+pi.auth.token.access_token;
  headers["Accept"] = "application/vnd.com.runkeeper.User+json";
  request.get({url:"https://api.runkeeper.com/user", json:true, headers:headers}, function(err, resp, body) {
    if(err || !body || !body.userID) return cb(err);
    headers["Accept"] = "application/vnd.com.runkeeper.Profile+json";
    request.get({url:"https://api.runkeeper.com"+body.profile, json:true, headers:headers}, function(err, resp, profile) {
      if(err || !profile || !profile.name) return cb(err);
      body.profile = profile;
      pi.auth.profile = body;
      pi.auth.pid = body.userID+'@runkeeper'; // profile id
      var base = 'user:'+pi.auth.pid+'/self';
      var data = {};
      data[base] = [body];
      cb(null, {auth: pi.auth, data: data});
    });
  });
};