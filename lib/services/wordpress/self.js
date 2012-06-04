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
  request.get({uri:'https://public-api.wordpress.com/rest/v1/me', headers:{authorization:'Bearer '+pi.auth.token.access_token}, json:true}, function(err, resp, me){
    if(err) return cb(err);
    if(resp.statusCode != 200 || !me || !me.ID) return cb(resp.statusCode+': '+JSON.stringify(me))
    request.get({uri:'https://public-api.wordpress.com/rest/v1/sites/'+pi.auth.token.blog_id, headers:{authorization:'Bearer '+pi.auth.token.access_token}, json:true}, function(err, resp, site){
      if(err) return cb(err);
      if(resp.statusCode != 200 || !site || !site.ID) return cb(resp.statusCode+': '+JSON.stringify(site))
      pi.auth.pid = me.ID+'.'+site.ID+'@wordpress';
      me.site = site;
      pi.auth.profile = me;
      var data = {};
      data['profile:'+pi.auth.pid+'/self'] = [me];
      cb(null, {data:data, auth:pi.auth});
    });
  });
}
