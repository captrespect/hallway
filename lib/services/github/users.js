var async = require('async');
var request = require('request');

// I'm not in love w/ the experiment here to do two in one and how arg/type/types/etc is used, but it works for now

exports.sync = function(processInfo, cb) {
    var arg = {};
    arg.types = {following:[], followers:[]};
    arg.headers = {"Authorization":"token "+processInfo.auth.accessToken, "Connection":"keep-alive"};
    async.forEach(Object.keys(arg.types), function(type, cb2){ FoF(type, arg, cb2); }, function(err){
      var data = {};
      data['user:'+processInfo.auth.pid+'/followers'] = arg.types.followers;
      data['user:'+processInfo.auth.pid+'/following'] = arg.types.following;
      cb(err, {data : data});
    });
};

function FoF(type, arg, cb)
{
    request.get({url:"https://api.github.com/user/"+type, json:true, headers:arg.headers}, function(err, resp, body) {
        if(err || !body || !Array.isArray(body)) return cb(err);
        async.forEachLimit(body, 10, function(user, cb2){
            request.get({url:"https://api.github.com/users/"+user.login, json:true, headers:arg.headers}, function(err, resp, body) {
                if(body) arg.types[type].push(body);
                cb2();
            });
        }, cb);
    });
}
