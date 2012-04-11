/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var instagram = require('./lib.js');

exports.sync = function(pi, cb) {
  var resp = {data : {}};
  var contacts = resp.data['contact:'+pi.auth.pid+'/follows'] = [];
  instagram.getFollows(pi, {}, function(item){ contacts.push(item) }, function(err) {
    cb(err, resp);
  });
}