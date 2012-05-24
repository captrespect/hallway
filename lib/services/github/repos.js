var request = require('request');

exports.sync = function(pi, cb) {
  request.get({url:"https://api.github.com/user/repos?access_token=" + pi.auth.accessToken, json:true}, function(err, resp, body) {
    if(err || !body) return cb(err);
    var base = 'repo:'+pi.auth.pid+'/repos';
    var data = {};
    data[base] = body;
    cb(null, {data: data});
  });
};
