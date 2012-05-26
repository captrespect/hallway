/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fb = require('./lib.js');
var async = require('async');

exports.sync = function(pi, cb) {
    var arg = {id:"me",type:"home",limit:200,accessToken:pi.auth.accessToken};
    var since=0;
    if (pi.config && pi.config.homeSince) since = arg.since = pi.config.homeSince;
    if (pi.config && pi.config.homeNext) arg.page = pi.config.homeNext; // if we're paging the first time
    var resp = {data: {}, config: {}};
    fb.getPostPage(arg,function(err, js){
        if (err) return cb(err);
        if (!Array.isArray(js.data)) return cb("no posts array");
        var photos = resp.data['photo:'+pi.auth.pid+'/home_photos'] = [];
        var posts = resp.data['post:'+pi.auth.pid+'/home'] = [];
        async.forEach(js.data, function(post, cb2){
          posts.push(post);
          // find the newest!
          if (post.updated_time > since) since = post.updated_time;
          // if photo, expand it
          if(post.type != "photo") return cb2();
          fb.getObject({id:post.object_id,accessToken:pi.auth.accessToken}, function(err, obj){
            if(obj) photos.push(obj);
            cb2();
          });
        }, function(){
          resp.config.homeSince = since;
          // if we got full limit and we're paging through, always use that
          if (js.data.length != 0 && js.paging && js.paging.next) {
              resp.config.homeNext = js.paging.next;
              resp.config.nextRun = -1;
          }else{
              resp.config.homeNext = false;
          }
          cb(err, resp);          
        });
    });
};
