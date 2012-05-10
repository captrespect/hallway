/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var tumblr = require('./lib.js');
var path = require('path');

exports.sync = function(pi, cb) {
  pi.tb = require(path.join(__dirname, 'tumblr_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
  var since = 0;
  if (pi.config && pi.config.dashboardSince) since = pi.config.dashboardSince;
  var resp = {data:{ }, config:{ }};
  var base = 'post:'+pi.auth.pid+'/dashboard';
  var posts = resp.data[base] = [];
  tumblr.getDashboard(pi, {since_id:since}, function(post){
    posts.push(post);
    if(post.id > since) since = post.id;
  }, function(err) {
    resp.config.dashboardSince = since;
    cb(err, resp);
  });
}
