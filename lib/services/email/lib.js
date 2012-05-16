var base = 'https://api.context.io/2.0/';
var OAlib = require('oauth').OAuth;

exports.fetch = function(keys, path, cb, body) {
  var OA = new OAlib(null, null, keys.appKey, keys.appSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
  function proc(err, body){
    if(err) return cb(err);
    if(body && body.indexOf('http') == 0) return cb(null, body); // special for redirects
    var js;
    try{ js = JSON.parse(body); }catch(E){ return cb(err); }
    cb(null, js);
  }
  var url = base+path;
  if(body) return OA.post(url, '', '', body, proc);
  OA.get(url, '', '', proc);
};
