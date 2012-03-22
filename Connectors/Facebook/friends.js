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
    var contacts = resp.data.contact = [];
    fb.getFriends({id:"me", accessToken:pi.auth.accessToken},function(friend){
        contacts.push(friend);
    },function(err) {
        cb(err, resp);
    });
};
