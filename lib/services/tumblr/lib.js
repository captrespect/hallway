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
    url = require('url'),
    crypto = require("crypto");

    
var base = 'http://api.tumblr.com/v2';

exports.getMe = function(pi, arg, cbEach, cbDone) {
  arg.path = '/user/info';
  getOne(pi, arg, function(err,me){
    if(err || !me || !me.user) return cbDone(err);
  	cbEach(me.user);
    cbDone();
  });
}

exports.getFollowing = function(pi, arg, cbEach, cbDone) {
    var me = this;
    arg.path = '/user/following';
    arg.field = 'blogs';
    var q = async.queue(function(js,cb){ // use a queue to process each block of ids
        me.getBlog(pi, {url:js.url}, cbEach, cb);
    },3);
    getPages(pi, arg, q.push, function(err){
        if(err) return cbDone(err);
        if(q.length() == 0) return cbDone(); // queue could be done, but likely not
        q.drain = cbDone; // whenever it finishes...
    });
}

exports.getBlog = function(pi, arg, cbEach, cbDone) {
    if(!arg.url) return cbDone("no url");
    var u = url.parse(arg.url);
    if(!u || !u.hostname) return cbDone("no hostname found in url");
    arg.path = '/blog/'+u.hostname+'/info';
    delete arg.url;
    arg.field = 'blog';
    getOneKey(pi, arg, function(err, js){
        if(err) return cbDone(err);
        cbEach(js);
        cbDone();
    });
}

exports.getDashboard = function(pi, arg, cbEach, cbDone) {
    arg.path = '/user/dashboard';
    arg.field = 'posts';
    arg.reblog_info = true;
    arg.notes_info = true;
    getPages(pi, arg, cbEach, cbDone);
}

exports.getPosts = function(pi, arg, cbEach, cbDone) {
    if(!arg.blog) return cbDone("no blog");
    arg.path = '/blog/'+arg.blog+'/posts';
    delete arg.blog;
    arg.field = 'posts';
    arg.reblog_info = true;
    arg.notes_info = true;
    getPagesKey(pi, arg, cbEach, cbDone);
}

function getOneKey(pi, arg, cb)
{
    if(!arg.path) return cb("no path");
    if(!arg.field) return cb("no field");
    var api = url.parse(base+arg.path);
    arg.api_key = pi.auth.consumerKey;
    api.query = arg;
    var field = arg.field;
    request.get({uri:url.format(api)}, function(err, resp, body) {
        var js;
        try{
            if(err) throw err;
            js = JSON.parse(body);
        }catch(E){
            return cb(E);
        }
        if(js && js.meta && js.meta.status === 200 && js.response && js.response[field]) return cb(null, js.response[field]);
        cb("couldn't understand reponse");
    });
}

function getOne(pi, arg, cb)
{
    if(!arg.path) return cb("no path");
    arg.token = pi.auth.token;
    pi.tb.apiCall('GET', arg.path, arg, function(err, js){
        if(!err && js && js.meta && js.meta.status === 200 && js.response) return cb(null, js.response);
        cb(err);
    });
}

function getPages(pi, arg, cbEach, cbDone)
{
    if(!arg.path) return cbDone("no path");
    if(!arg.field) return cbDone("no field");
    if(!arg.offset) arg.offset = 0;
    if(!arg.limit) arg.limit = 50;
    if(arg.since_id == 0) delete arg.since_id; // apparently sending a 0 drastically changes the result set selection, for dashboard at least
    arg.token = pi.auth.token;
    pi.tb.apiCall('GET', arg.path, arg, function(err, js){
        if(err || !js || !js.meta || js.meta.status != 200 || !js.response || !Array.isArray(js.response[arg.field]) || js.response[arg.field].length == 0) return cbDone(err);
        var hash = crypto.createHash("sha1").update(JSON.stringify(js.response[arg.field][0])).digest('hex');
        if(arg.dup === hash) return cbDone(); // tumblr keeps returning stuff even when increasing offset, have to dup check
        arg.dup = hash;
        for(var i = 0; i < js.response[arg.field].length; i++) cbEach(js.response[arg.field][i]);
        if(js.response[arg.field].length < arg.limit) return cbDone(); // at the end
        arg.offset += arg.limit;
        return getPages(pi, arg,cbEach,cbDone);
    });
}

function getPagesKey(pi, arg, cbEach, cbDone)
{
    if(!arg.offset) arg.offset = 0;
    if(!arg.limit) arg.limit = 50;
    getOneKey(pi, arg, function(err, arr){
        if(err || !arr || !Array.isArray(arr) || arr.length == 0) return cbDone(err);
        for(var i = 0; i < arr.length; i++) cbEach(arr[i]);
        if(arr.length < arg.limit) return cbDone(); // at the end
        arg.offset += arg.limit;
        return getPagesKey(pi,arg,cbEach,cbDone);
    });
}

