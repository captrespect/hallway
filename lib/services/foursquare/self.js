/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var util = require('util');

exports.sync = function(pi, cb) {
  request.get({uri:'https://api.foursquare.com/v2/users/self?v=20120413&oauth_token='+pi.auth.accessToken, json:true}, function(err, resp, js) {
    if(err) return callback(err);
    if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
    if(!js || !js.response || !js.response.user) return callback(new Error("missing response.user: "+util.inspect(js)));
    var self = js.response.user;
    var auth = pi.auth;
    auth.profile = self; // map to shared profile
    auth.pid = self.id+'@foursquare'; // profile id
    var base = 'contact:'+auth.pid+'/self';
    var data = {};
    data[base] = [self];
    cb(null, {auth:auth, data:data});
  });
};
