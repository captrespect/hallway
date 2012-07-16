/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fb = require('./lib.js');

exports.sync = function(pi, cb) {
  var args = {
    id          : "me",
    type        : "feed",
    limit       : 200,
    accessToken : pi.auth.accessToken
  };
  var resp = {data: {}, config: {}};

  if (!pi.config) pi.config = {};
  if (pi.config.feedSince) args.since = pi.config.feedSince;
  if (pi.config.feedNext)  args.page  = pi.config.feedNext;

  fb.getPostPage(args, function(err, posts){
    if(err) return cb(err);
    if(!Array.isArray(posts.data)) return cb("No posts array");

    // Find the newest
    var since = args.since || 0;
    posts.data.forEach(function(post){
      if (post.updated_time > since) since = post.updated_time;
    });
    resp.config.feedSince = since;

    var base = 'post:' + pi.auth.pid + '/feed';
    resp.data[base] = posts.data;
    // if we got full limit and we're paging through, always use that
    if (posts.data.length !== 0 && posts.paging && posts.paging.next) {
      resp.config.feedNext = posts.paging.next;
      resp.config.nextRun = -1;
    } else {
      resp.config.feedNext = false;
    }

    cb(err, resp);
  });
};
