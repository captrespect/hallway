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
  // only sync feed for the primary blog?! TODO
  if(pi.auth.profile.primary_blog != pi.auth.profile.site.ID) return cb();
  request.get({uri:'https://public-api.wordpress.com/rest/v1/freshly-pressed/?number=40', headers:{authorization:'Bearer '+pi.auth.token.access_token}, json:true}, function(err, resp, js){
    if(err) return cb(err);
    if(resp.statusCode != 200 || !js || !Array.isArray(js.posts)) return cb(resp.statusCode+': '+JSON.stringify(js))
    var data = {};
    data['post:'+pi.auth.pid+'/feed'] = js.posts;
    cb(null, {data:data});
  });
}
