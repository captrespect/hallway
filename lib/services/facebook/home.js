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
    var arg = {id:"me",type:"home",limit:100,accessToken:pi.auth.accessToken};
    var since=0;
    if (pi.config && pi.config.homeSince) since = arg.since = pi.config.homeSince;
    if (pi.config && pi.config.homeNext) arg.page = pi.config.homeNext; // if we're paging the first time
    var resp = {data: {}, config: {}};
    fb.getPostPage(arg,function(err, js){
        if (err) return cb(err);
        if (!Array.isArray(js.data)) return cb("no posts array");
        // find the newest!
        js.data.forEach(function(post){ if (post.updated_time > since) since = post.updated_time; });
        var base = 'post:'+pi.auth.pid+'/home';
        resp.data[base] = js.data;
        resp.config.homeSince = since;
        // if we got full limit and we're paging through, always use that
        if (js.data.length == arg.limit && js.paging && js.paging.next) {
            resp.config.homeNext = js.paging.next;
            resp.config.nextRun = -1;
        }
        cb(err, resp);
    });
};
