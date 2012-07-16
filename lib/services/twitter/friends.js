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
  arg.path = '/friends/ids.json';
  arg.cursor = pi.config.friendsCursor;
  arg.slice = pi.config.friendsSlice;
  tw.getFFchunk(pi, arg, function(err, contacts) {
    if(contacts) resp.data['contact:'+pi.auth.profile.id+'@twitter/friends'] = contacts;
    resp.config = {friendsCursor:arg.cursor, friendsSlice:arg.slice};
    cb(err, resp);
  });
};
