/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var tumblr = require('./lib.js');
var path = require('path');

exports.sync = function(pi, cb) {
  var me;
  pi.tb = require(path.join(__dirname, 'tumblr_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
  tumblr.getMe(pi, {}, function(js){ me=js}, function(err){
  	if(err || !me) return cb(err||new Error("me missing"));
    pi.auth.profile = me; // map to shared profile
    pi.auth.pid = me.name+'@tumblr'; // profile id
    var base = 'user:'+pi.auth.pid+'/self';
    pi.data = {};
    pi.data[base] = [me];
    cb(err, pi);
  });
};
