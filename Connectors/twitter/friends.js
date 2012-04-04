/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var path = require('path');
var tw = require(path.join(__dirname, 'lib.js'))

exports.sync = function(pi, cb) {
    pi.tc = require(path.join(__dirname, 'twitter_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
    var resp = {data:{ }};
    var base = 'contact:'+pi.auth.profile.id+'@twitter/friend';
    var contacts = resp.data[base] = [];
    tw.getMyFriends(pi,function(friend){ contacts.push(friend) }, function(err) {
        cb(err, resp);
    });
};
