exports.genericSync = function(type, pather, cbDone) {
    return function(pi, cb) {
        var OAlib = require('oauth').OAuth;
        var OA = new OAlib(null, null, pi.auth.consumerKey, pi.auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
        var path = pather(pi);
        if(!path) return cb(null, {config:pi.config, data:{}}); // nothing to do
        var url = 'http://api.linkedin.com/v1/'+path;
        OA.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
          if(err) return cb(err);
          var js;
          try{ js = JSON.parse(body); }catch(E){ return cb(err); }
          cbDone(pi, js, cb);
        });
    };
};
