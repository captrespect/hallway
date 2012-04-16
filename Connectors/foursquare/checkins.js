/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var checkins_limit = 250;
var util = require('util');

exports.sync = function(pi, cb) {
  if(!pi.config.checkinsThrough) pi.config.checkinsThrough = 0;
  getCheckins(pi.config, pi.auth.profile.id, pi.auth.accessToken, 0, function(err, checkins) {
    var data = {};
    data['checkin:'+pi.auth.pid+'/checkins'] = checkins;
    cb(err, {data:data, config:pi.config});
  });
};

function getCheckins(config, userID, token, offset, callback, checkins) {
    if(!checkins)
        checkins = [];
    var latest = config.checkinsThrough;
    latest += 1; //"afterTimestamp" is really "afterOrEqualToTimestamp"
    request.get({uri:'https://api.foursquare.com/v2/users/self/checkins.json?limit=' + checkins_limit + '&offset=' + offset +
                                                            '&oauth_token=' + token + '&afterTimestamp=' + latest, json:true},
    function(err, resp, js) {
      if(err) return callback(err);
      if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
      if(!js || !js.response || !js.response.checkins) return callback(new Error("missing response.checkins: "+util.inspect(js)));
      var response = js.response;
      if(!(response.checkins && response.checkins.items)) { //we got nothing
          if(checkins.length > 0)
              config.checkinsThrough = checkins[0].createdAt;
          return callback(err, checkins);
      }
      var newCheckins = response.checkins.items;
      addAll(checkins, newCheckins);
      if(newCheckins && newCheckins.length == checkins_limit)
          getCheckins(config, userID, token, offset + checkins_limit, callback, checkins);
      else {
          if (checkins[0]) config.checkinsThrough = checkins[0].createdAt
          callback(err, checkins);
      }
    });
}

function getMe(token, callback) {
    request.get({uri:'https://api.foursquare.com/v2/users/self.json?oauth_token=' + token}, callback);
}

function addAll(thisArray, anotherArray) {
    if(!(thisArray && anotherArray && anotherArray.length))
        return;
    for(var i = 0; i < anotherArray.length; i++)
        thisArray.push(anotherArray[i]);
}
