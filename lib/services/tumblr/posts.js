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
  var since = 0;
  if (pi.config && pi.config.postsSince) since = pi.config.postsSince;
  var resp = {data:{ }, config:{ }};
  var base = 'post:'+pi.auth.pid+'/posts';
  var posts = resp.data[base] = [];
  var blog = getBlog(pi.auth.profile.blogs);
  if(!blog) return cb(new Error("no primary blog"));
  var newest = since;
  tumblr.getPosts(pi, {blog:blog}, function(post){
    if(post.timestamp <= since) return true; // bail out if older than seen
    posts.push(post);
    if(post.timestamp > newest) newest = post.timestamp;
  }, function(err, js) {
    resp.config.postsSince = newest;
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
