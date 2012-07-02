var OAlib = require('oauth').OAuth;

exports.sync = function(pi, cb) {
  var OA = new OAlib(null, null, pi.auth.consumerKey, pi.auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
  var url = 'https://api.dropbox.com/1/account/info';
  OA.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
    if(err) return cb(err);
    var js;
    try{ js = JSON.parse(body); }catch(E){ return cb(err); }
    pi.auth.profile = js; // stash
    pi.auth.pid = js.uid+'@dropbox';
    var base = 'account:'+pi.auth.pid+'/self';
    var data = {};
    data[base] = [js];
    cb(null, {auth:pi.auth, data:data});
  });
};
