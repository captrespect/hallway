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
    auth = processInfo.auth;
    exports.syncBadges(pi.auth, function(err, newBadges) {
        var data : {};
        data['badge:'+pi.auth.pid+'/badges'] = newBadges;
        cb(err, {data:data});
    });
};


exports.syncBadges = function (auth, callback) {
  getBadges(auth.accessToken, function(err, resp, js) {
    if(err) return callback(err);
    if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
    if(!js || !js.response || !js.response.badges) return callback(new Error("missing response.badges: "+util.inspect(js)));
    var badges_json = js.response.badges;
    var newBadges = [];
    for (var badge in badges_json) {
      // not sure why this logic is here?
      if (badges_json[badge]['unlocks'].length > 0) newBadges.push(badges_json[badge]);
    }
    callback(null, newBadges);
  });
}

function getBadges(token, callback) {
    request.get({uri:'https://api.foursquare.com/v2/users/self/badges.json?v=20111202&oauth_token=' + token, json:true}, callback);
}
