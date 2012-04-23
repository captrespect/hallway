/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var path = require('path');
var tw = require(path.join(__dirname, 'lib.js'));
var async = require('async');

exports.sync = function(pi, cb) {
  pi.tc = require(path.join(__dirname, 'twitter_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
  var resp = {data:{}};
  var statuses = false;
  tw.getTimelinePage(pi, {screen_name:pi.auth.profile.screen_name, count:50},function(js){
    statuses = js;
  },function(err){
    if(!statuses) return cb(err, resp);
    var related = [];
    async.forEachSeries(statuses,function(tweet,callback){
      tw.getRelated(pi, {id:tweet.id_str},function(rel){
        rel._id = tweet.id_str; // track original
        related.push(rel);
      },callback);
    },function(err){
      var base = 'related:'+pi.auth.profile.id+'@twitter/related';
      resp.data[base] = related;
      cb(err, resp);
    });
  });
};
