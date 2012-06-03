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
    var base = 'contact:'+pi.auth.profile.id+'@twitter/followers';
    var contacts = resp.data[base] = [];
    tw.getMyFollowers(pi,function(friend){ contacts.push(friend) }, function(err) {
        cb(contacts.length > 0 ? null : err, resp); // return error only when empty, often one or two contacts error out
    });
};
