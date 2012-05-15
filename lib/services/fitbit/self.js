
exports.sync = require('./lib').genericSync(function(pi){
    return 'profile.json';
}, function(pi, js, cb){
  if(!js || !js.user) return cb(new Error("invalid data"));
  pi.config.memberSince = js.user.memberSince; // used by activity
  pi.auth.profile = js.user; // stash
  pi.auth.pid = js.user.encodedId+'@fitbit'; // profile id
    var base = 'profile:'+pi.auth.pid+'/self';
    var data = {};
    data[base] = [js.user];
    cb(null, {auth:pi.auth, data:data});
});
