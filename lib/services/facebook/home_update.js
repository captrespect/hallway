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
    var arg = {id:"me",type:"home",since:"yesterday",accessToken:pi.auth.accessToken}; // only monitoring changes within the last 24h for now?
    var resp = {data: {}};
    var base = 'post:'+pi.auth.pid+'/home';
    var posts = resp.data[base] = [];
    fb.getPosts(arg,function(post){
        if(post.updated_time > post.created_time) posts.push(post);
    },function(err) {
        cb(err, resp);
    });
};
