/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fb = require('./lib.js');

exports.sync = function(processInfo, cb) {
    fb.getProfile(processInfo.auth, function(err, self){
        if(err) return cb(err);
        processInfo.auth.profile = self; // map to shared profile
        processInfo.auth.id = self.id;
        cb(err, {data: { self: [self] }, auth: processInfo.auth});
    });
};
