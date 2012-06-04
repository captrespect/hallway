/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');

exports.sync = function(pi, cb) {
  request.get({uri:'https://public-api.wordpress.com/rest/v1/sites/'+pi.auth.token.blog_id+'/posts/?number=100', headers:{authorization:'Bearer '+pi.auth.token.access_token}, json:true}, function(err, resp, js){
    if(err) return cb(err);
    if(resp.statusCode != 200 || !js || !js.posts) return cb(resp.statusCode+': '+JSON.stringify(js))
    var data = {};
    data['post:'+pi.auth.pid+'/posts'] = js.posts;
    cb(null, {data:data});
  });
}
