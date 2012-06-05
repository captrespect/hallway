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
  var after = pi.config.feedAfter||(Date.now()-864000000);
  if(pi.auth.profile.primary_blog != pi.auth.profile.site.ID) return cb();
  request.get({uri:'https://public-api.wordpress.com/rest/v1/freshly-pressed/?number=40&after='+(new Date(after+1000).toISOString()), headers:{authorization:'Bearer '+pi.auth.token.access_token}, json:true}, function(err, resp, js){
    if(err) return cb(err);
    if(resp.statusCode != 200 || !js || !Array.isArray(js.posts)) return cb(resp.statusCode+': '+JSON.stringify(js))
    js.posts.forEach(function(post){
      var mod = new Date(post.modified).getTime();
      if(mod > after) after = mod;
    });
    var data = {};
    data['post:'+pi.auth.pid+'/feed'] = js.posts;
    var config = {feedAfter:after};
    if(js.posts.length > 0) config.nextRun = -1;
    cb(null, {data:data, config:config});
  });
}
