var request = require('request');

exports.sync = function(pi, cb) {
  request.get({uri:'https://www.googleapis.com/oauth2/v1/userinfo', headers:{authorization:'Bearer '+pi.auth.token.access_token}, json:true}, function(err, resp, me){
    if(err) return cb(err);
    if(resp.statusCode != 200 || !me || !me.id) return cb(resp.statusCode+': '+JSON.stringify(me))
    pi.auth.pid = me.id+'@google';
    pi.auth.profile = me;
    var data = {};
    data['profile:'+pi.auth.pid+'/self'] = [me];
    cb(null, {data:data, auth:pi.auth});
  });
}
