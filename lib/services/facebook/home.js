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
    type        : "home",
    limit       : 200,
    accessToken : pi.auth.accessToken
  };
  var resp = {data: {}, config: {}};

  if (pi.config && pi.config.homeSince) args.since = pi.config.homeSince;
  if (pi.config && pi.config.homeNext)  args.page  = pi.config.homeNext;

  fb.getPostPage(args, function(err, posts) {
    if (err) return cb(err);
    if (!Array.isArray(posts.data)) return cb("No posts array");

    resp.data['post:' + pi.auth.pid + '/home'] = posts.data;

    // Find the newest
    var since = args.since || 0;
    posts.data.forEach(function(post) {
      if (post.updated_time > since) since = post.updated_time;
    });
    resp.config.homeSince = since;

    var auth = {accessToken : pi.auth.accessToken};
    fb.getPostPhotos(auth, posts, function(err, photos) {
      if(photos) resp.data['photo:' + pi.auth.pid + '/home_photos'] = photos;

      // If we got full limit and we're paging through, always use that
      if (posts.data.length !== 0 && posts.paging && posts.paging.next) {
        resp.config.homeNext = posts.paging.next;
        resp.config.nextRun = -1;
      } else {
        resp.config.homeNext = false;
      }

      cb(null, resp);
    });
  });
};
