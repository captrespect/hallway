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
  var resp = {data:{}};
  var arg = {};
  arg.path = '/followers/ids.json';
  arg.cursor = pi.config.followersCursor;
  arg.slice = pi.config.followersSlice;
  tw.getFFchunk(pi, arg, function(err, contacts) {
    if(contacts) resp.data['contact:'+pi.auth.profile.id+'@twitter/followers'] = contacts;
    resp.config = {followersCursor:arg.cursor, followersSlice:arg.slice};
    cb(err, resp);
  });
};
