/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');

exports.sync = function(pi, cb) {
  pi.data = {};
  var base = 'photo:'+pi.auth.pid+'/feed';
  var posts = pi.data[base] = [];
  var arg = {};
  if(pi.config.feedSince) arg.min_id = pi.config.feedSince;
  if(pi.config.feedAt) arg.min_timestamp = pi.config.feedAt;
  function poser(post){
    posts.push(post);
    if(parseInt(post.id) > (pi.config.feedSince||0)) pi.config.feedSince = post.id;
    if(post.created_time > (pi.config.feedAt||0)) pi.config.feedAt = post.created_time;    
  }
  instagram.getFeed(pi, arg, poser, function(err) {
    if(posts.length > 0 || !pi.config.feedAt) return cb(err, pi);
    // There's a nasty bug, since instagram doesn't support min_timestamp on feed yet, and it seems if the min_id given is invalid (deleted), it returns empty! So internally getFeed validates min_timestamp
    instagram.getFeed(pi, {min_timestamp:pi.config.feedAt}, poser, function(err) {
      cb(err, pi);
    });
  });
}