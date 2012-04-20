/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');

// really dumb, just get the last 50 photos posted and received and process them, any new comments/likes will generate updated events
exports.sync = function(pi, cb) {
    var responseObj = {data : {}};
    instagram.getMediaRecent(pi, {count:50}, function(err, photos){
        if(photos) responseObj.data['photo:'+pi.auth.pid+'/media'] = photos;
        instagram.getFeedRecent(pi, {count:50}, function(err, posts){
            if(posts) responseObj.data['photo:'+pi.auth.pid+'/feed'] = posts;
            cb(err, responseObj);
        });
    });
}