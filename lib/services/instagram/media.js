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
  var base = 'photo:'+pi.auth.pid+'/media';
  var posts = pi.data[base] = [];
  var arg = {};
  if(pi.config.mediaSince) arg.min_timestamp = pi.config.mediaSince;
  instagram.getMedia(pi, arg, function(post){
    posts.push(post);
    if(post.created_time > (pi.config.mediaSince||0)) pi.config.mediaSince = post.created_time;
  }, function(err) {
    cb(err, pi);
  });
}