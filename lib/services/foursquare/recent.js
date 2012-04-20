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
  exports.syncRecent(pi.auth, function(err, recents) {
    var data = {};
    data['checkin:'+pi.auth.pid+'/recent'] = recents;
    cb(err, {data:data});
  });
};

exports.syncRecent = function (auth, callback) {
  getRecent(auth.accessToken, function(err, resp, js) {
    if(err) return callback(err);
    if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
    if(!js || !js.response || !js.response.recent) return callback(new Error("missing response.recent: "+util.inspect(js)));
    callback(null, js.response.recent);
  });
}

function getRecent(token, callback) {
  request.get({uri:'https://api.foursquare.com/v2/checkins/recent.json?limit=100&oauth_token=' + token, json:true}, callback);
}