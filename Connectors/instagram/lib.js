/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var async = require('async');
var url = require('url');

var base = "https://api.instagram.com/v1/";

exports.getSelf = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self';
  getOne(arg, function(err, self){
    if(err || !self || !self.id) return cbDone(err);
    cbEach(self);
    cbDone();
  });
}

exports.getMedia = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/media/recent';
  getPages(arg, cbEach, cbDone);
}

exports.getFollows = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/follows';
  getPages(arg, cbEach, cbDone);
}

exports.getFeed = function(pi, arg, cbEach, cbDone) {
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/feed';
  getPages(arg, cbEach, cbDone);
}

// just get one block of recent ones
exports.getMediaRecent = function(pi, cb) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/media/recent';
  getOne(arg, cb);
}
exports.getFeedRecent = function(pi, cb) {
  var arg = {};
  arg.access_token = pi.auth.token && pi.auth.token.access_token;
  arg.path = '/users/self/feed';
  getOne(arg, cb);
}

function getOne(arg, cb) {
  if(!arg || !arg.path) return cb("no path");
  var api = url.parse(base+arg.path);
  delete arg.path;
  api.query = arg;
  request.get({uri:url.format(api), json:true}, function(err, res, body) {
    if(err || !res) return cb(err);
    if(res.statusCode != 200) return cb("status code "+res.statusCode);
    if(!body || !body.meta) return cb("invalid response: "+JSON.stringify(body));
    if(body.meta.code != 200) return cb(JSON.stringify(body.meta));
    cb(null,body.data);
  });
}

function getPages(arg, cbEach, cbDone) {
  if(!arg) return cbDone("no arg");
  // compose the uri if none
  if(!arg.uri)
  {
    if(!arg.path) return cbDone("no uri or path given");
    var api = url.parse(base+arg.path);
    delete arg.path;
    api.query = arg;
    arg.uri = url.format(api);
  }
  request.get({uri:arg.uri, json:true}, function(err, res, body) {
    if(err || !res) return cbDone(err);
    if(res.statusCode != 200) return cbDone("status code "+res.statusCode);
    if(!body || !body.meta) return cbDone("invalid response: "+JSON.stringify(body));
    if(body.meta.code != 200) return cbDone(JSON.stringify(body.meta));
    for(var i = 0; body.data && i < body.data.length; i++) cbEach(body.data[i]);
    if(body.pagination && body.pagination.next_url && body.pagination.next_url != arg.uri) {
      arg.uri = body.pagination.next_url;
      getPages(arg, cbEach, cbDone);
    } else {
      cbDone();
    }
  });
}

