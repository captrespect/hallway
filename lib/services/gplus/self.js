/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var gplus = require('./lib.js');

exports.sync = function(pi, cb) {
  gplus.getMe(pi.auth, function(err, me){
    if(err || !me || !me.id) return cb(err);
    pi.auth.pid = me.id+'@gplus';
    pi.auth.profile = me;
    var data = {};
    data['profileXXXXXXX']
  });
}
