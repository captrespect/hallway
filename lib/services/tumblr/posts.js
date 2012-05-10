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
var url = require('url');

exports.sync = function(pi, cb) {
  pi.tb = require(path.join(__dirname, 'tumblr_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
  var offset = 0;
  if (pi.config && pi.config.postsOffset) offset = pi.config.postsOffset;
  var resp = {data:{ }, config:{ }};
  var base = 'post:'+pi.auth.pid+'/posts';
  var posts = resp.data[base] = [];
  var blog = getBlog(pi.auth.profile.blogs);
  if(!blog) return cb(new Error("no primary blog"));
  tumblr.getPosts(pi, {blog:blog, offset:offset}, function(post){
    posts.push(post);
  }, function(err) {
    offset += posts.length;
    resp.config.postsOffset = offset;
    cb(err, resp);
  });
}

// only return primary blog, TODO make this somehow app/user selectable, or get all 
function getBlog(blogs)
{
  if(!blogs || !Array.isArray(blogs) || blogs.length == 0) return undefined;
  var primary = undefined;
  blogs.forEach(function(blog){
    if(blog.primary && typeof blog.url == 'string') return primary = url.parse(blog.url).host;
  });
  return primary;
}
