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
  exports.syncFriends(pi.auth, function(err, friends) {
    var data = {};
    data['contact:'+pi.auth.pid+'/friends'] = friends;
    cb(err, {data:data});
  });
};

exports.syncFriends = function(auth, callback) {
  // TODO: add paging and don't just limit at 500, also any way to detect which ones changed?
  request.get({uri:'https://api.foursquare.com/v2/users/self/friends.json?oauth_token=' + auth.accessToken + '&limit=500', json:true}, function(err, resp, js) {
    if(err) return callback(err);
    if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
    if(!js || !js.response || !js.response.friends || !js.response.friends.items) return callback(new Error("missing response.friends.items: "+util.inspect(js)));
    var friends = js.response.friends.items.map(function(item) {return item.id});
    // get the rich versions of each friend
    downloadUsers(auth, friends, callback);
  });
}

// multi-fetcher
function downloadUsers(auth, users, callback) {
  var coll = users.slice(0);
  var contacts = [];
  (function downloadUser() {
    if (coll.length == 0) {
      return callback(null, contacts);
    }
    var friends = coll.splice(0, 5);
    var requestUrl = 'https://api.foursquare.com/v2/multi?requests=';
    for (var i = 0; i < friends.length; i++) {
      requestUrl += "/users/" + friends[i] + ",";
    }
    request.get({uri:requestUrl + "&oauth_token=" + auth.accessToken, json:true}, function(err, resp, js) {
      if(err) return callback(err, contacts);
      if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)), contacts);
      if(!js || !js.response || !js.response.responses) return callback(new Error("missing response.friends.items: "+util.inspect(js)), contacts);
      var responses = js.response.responses;
      // loop through each result
      (function parseUser() {
        var friend = responses.splice(0, 1)[0];
        if (friend == undefined || friend.response == undefined || friend.response.user == undefined) return downloadUser();
        contacts.push(friend.response.user);
        parseUser();
      })();
    });
  })();
}
