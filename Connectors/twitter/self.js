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
  var resp = {data:{}, auth:pi.auth};
  tw.getMe(pi, function(self){
    resp.auth.profile = self; // also save to auth master
    resp.auth.pid = self.id_str+'@twitter'; // set the normalized auth profile id, pid
    var base = 'contact:'+resp.auth.pid+'/self';
    resp.data[base] = [self];
  }, function(err) {
        cb(err, resp);
  });
};
