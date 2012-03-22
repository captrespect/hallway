/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require('fs'),
    request = require('request'),
    async = require('async'),
    url = require('url');
var path = require('path');

exports.getMe = function(pi, cbEach, cbDone) {
  var arg = {};
  arg.path = '/account/verify_credentials.json';
  arg.token = pi.auth.token;
  getOne(pi.tc, arg,function(err,me){
    if(me) cbEach(me);
    cbDone(err);
  });
}

// walk my friends list getting/caching each one
exports.getMyFriends = function(pi, cbEach, cbDone) {
    var me = this;
    var arg = {};
    arg.cursor=-1; // not sure why?
    arg.path = '/friends/ids.json';
    arg.token = pi.auth.token;
    getOne(pi.tc, arg, function(err,js){
        if(err || !js.ids || js.ids.length == 0) return cbDone(err);
        me.getUsers(pi, js.ids, cbEach, cbDone);
    });
}

// just get extended details of all friends
exports.getFriends = function(arg, cbEach, cbDone) {
    if(!arg.screen_name) return cbDone("missing screen_name");
    var me = this;
    arg.cursor=-1; // not sure why?
    arg.path = '/friends/ids.json';
    getOne(arg,function(err,js){
        if(err || !js.ids || js.ids.length == 0) return cbDone(err);
        me.getUsers(js.ids, cbEach, cbDone);
    });
}

// create a new tweet
exports.update = function(arg, cbEach, cbDone) {
    if(!arg.status) return cbDone("status missing");
    arg.path = '/statuses/update.json';
    postOne(arg,function(err,js){
        if(err) return cbDone(err);
        if(!js || !js.id_str) return cbDone("invalid response, missing id_str: "+JSON.stringify(js));
        cbEach(js);
        cbDone();
    });
}

// just get extended details of all followers
exports.getFollowers = function(arg, cbEach, cbDone) {
    var me = this;
    arg.path = '/followers/ids.json';
    var q = async.queue(function(js,cb){ // use a queue to process each block of ids
        me.getUsers(js.ids, cbEach, cb);
    },1);
    getIdList(arg,q.push,function(err){
        if(err) return cbDone(err);
        if(q.length() == 0) return cbDone(); // queue could be done, but likely not
        q.drain = cbDone;
    });
}

// get your home timeline, screen_name has to be me
exports.getTimeline = function(pi, arg, cbDone) {
    if(!arg.screen_name) return cbDone("missing screen_name");
    arg.path = '/statuses/home_timeline.json';
    arg.token = pi.auth.token;
    getPage(pi.tc,arg,cbDone);
}

// get just one chunk of a timeline, screen_name has to be me
exports.getTimelinePage = function(arg, cbEach, cbDone) {
    if(!arg.screen_name) return cbDone("missing screen_name");
    if(!arg.count) arg.count = 100;
    arg.path = '/statuses/home_timeline.json';
    getOne(arg,function(err,js){
        if(js) cbEach(js);
        cbDone(err);
    });
}

// should work for anyone, get their tweets
exports.getTweets = function(pi, arg, cbDone) {
    if(!arg.screen_name) return cbDone("missing screen_name");
    arg.path = '/statuses/user_timeline.json';
    arg.include_rts = true;
    arg.token = pi.auth.token;
    getPage(pi.tc,arg,cbDone);
}

// duh
exports.getMentions = function(pi, arg, cbDone) {
    if(!arg.screen_name) return cbDone("missing screen_name");
    arg.path = '/statuses/mentions.json';
    arg.token = pi.auth.token;
    getPage(pi.tc,arg,cbDone);
}

// get replies and retweets for any tweet id
exports.getRelated = function(arg, cbEach, cbDone) {
    if(!arg.id) return cbDone("missing tweet id");
    getOne({path:"/related_results/show/"+arg.id+".json"},function(err,related){
        if(err || !Array.isArray(related)) return cbDone(err);
        getOne({path:"/statuses/"+arg.id+"/retweeted_by.json"},function(err,retweeted){
            if(err || !Array.isArray(retweeted)) return cbDone(err);
            if(retweeted.length > 0) related.push({results:retweeted,resultType:"ReTweet"});
            if(related.length > 0) cbEach(related);
            cbDone();
        });
    });
}

// step through any sized list of ids using cursors
function getIdList(arg, cbEach, cbDone) {
    if(!arg.screen_name) return cbDone("missing screen_name");
    var me = this;
    if(!arg.cursor) arg.cursor = -1;
    getOne(arg,function(err,js){
        if(err || !js.ids || js.ids.length == 0) return cbDone(err);
        cbEach(js);
        arg.cursor = js.next_cursor;
        if(arg.cursor == 0) return cbDone();
        me.getIdList(arg, cbEach, cbDone);
    });
}

// bulk chunk get user details
exports.getUsers = function(pi, users, cbEach, cbDone) {
    if(users.length == 0) return cbDone();
    var lenStart = users.length;
    var me = this;
    var id_str = "";
    var ids = {};
    for(var i = 0; i < 100 && users.length > 0; i++) {
        id = users.pop();
        ids[id] = true; // track hash of all attempted
        if(i > 0) id_str += ',';
        id_str += id;
    }
    getOne(pi.tc, {path:'/users/lookup.json', user_id:id_str, token:pi.auth.token},function(err,infos){
        if(err) return cbDone(err);
        for(var i=0; i < infos.length; i++){
            if(!ids[infos[i].id_str]) continue; // skip dups
            delete ids[infos[i].id_str];
            cbEach(infos[i]);
        }
        for(id in ids){
            users.push(id); // any non-done users push back for next attempt
        }
        if(lenStart == users.length) return cbDone("failed to find remaining users");
        me.getUsers(pi, users, cbEach, cbDone); // loop loop till done
    });
}

// call the api non-authenticated
function getOnePublic(arg, cb) {
    if(!arg.path) return cb("no path");
    var api = url.parse('https://api.twitter.com/1'+arg.path);
    delete arg.path;
    api.query = arg;
    request.get({uri:url.format(api)}, function(err, resp, body) {
        var js;
        try{
            if(err) throw err;
            js = JSON.parse(body);
        }catch(E){
            return cb(E);
        }
        cb(null,js);
    });
}

function getOne(tc, arg, cb) {
    if(!arg.path) return cb("no path");
    arg.include_entities = true;
    tc.apiCall('GET', arg.path, arg, function(err, js){
        if(err) return cb(err);
        cb(null,js);
    });
}

function postOne(arg, cb) {
    if(!arg.path) return cb("no path");
    arg.token = auth.token;
    arg.include_entities = true;
    tw.apiCall('POST', arg.path, arg, function(err, js){
        if(err) return cb(err);
        cb(null,js);
    });
}

function getPage(tc, arg, cbDone) {
    if(!arg.path) return cb("no path");
    arg.count = 200;
    arg.include_entities = true;
    if(!arg.page) arg.page = 1;
    tc.apiCall('GET', arg.path, arg, function(err, js) {
        if(err) return cbDone(err);
        if(!Array.isArray(js)) return cbDone("result not an array");
        cbDone(null, js);
    });
}


function getPages(tc, arg, cbEach, cbDone) {
    if(!arg.path) return cb("no path");
    arg.count = 200;
    arg.include_entities = true;
    if(!arg.page) arg.page = 1;
    var token = arg.token; // need to stash this as tc whacks it
    tc.apiCall('GET', arg.path, arg, function(err, js) {
        // if error.statusCode == 500, retry?
        if(err || !Array.isArray(js) || js.length == 0) return cbDone(err);
        for(var i = 0; i < js.length; i++) cbEach(js[i]);
        arg.page++;
        arg.token = token;
        return getPages(tc,arg,cbEach,cbDone);
    });
}

