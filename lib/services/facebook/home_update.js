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
    var resp = {data: {}};
    var arg = {id:"me",type:"home",since:"yesterday",accessToken:pi.auth.accessToken}; // only monitoring changes within the last 24h for now?
    var posts = resp.data['post:'+pi.auth.pid+'/home'] = [];
    fb.getPosts(arg,function(post){
        if(post.updated_time > post.created_time) posts.push(post);
    },function(err) {
      arg.type = "feed";
      posts = resp.data['post:'+pi.auth.pid+'/feed'] = [];
      fb.getPosts(arg,function(post){
          if(post.updated_time > post.created_time) posts.push(post);
      },function(err) {
          cb(err, resp);
      });
    });
};
