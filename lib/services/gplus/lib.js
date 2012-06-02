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
    crypto = require("crypto"),
    querystring = require('querystring');

    
var base = 'https://www.googleapis.com/plus/v1';

exports.getMe = function(auth, cbDone) {
  getOne(auth, '/people/me', cbDone);
}

exports.getActivities = function(auth, arg, cbDone) {
  arg.path = '/people/me/activities/public';
  arg.field = 'items';
  getPage(auth, arg, cbDone);
}

function getOne(auth, path, cb)
{
    var api = url.parse(base+path);
    api.query = {access_token:auth.token.access_token};
    getter(auth, {uri:url.format(api), json:true}, function(err, resp, js) {
        if(js) return cb(null, js);
        cb("couldn't understand reponse");
    });
}

function getPages(auth, arg, cbDone)
{
    arg.access_token = auth.token.access_token;
    if(!arg.maxresults) arg.maxresults = 100;
    arg.alt = 'json';
    var api = url.parse(base+arg.path);
    api.query = arg;
    getter(auth, {uri:url.format(api), json:true}, function(err, resp, js) {
        if(err || !js) return cbDone(err);
        if(js.error) return cbDone(js.error);
        if(!Array.isArray(js[arg.field])) return cbDone("not an array");
        cbDone(null, js[arg.field], js); // return array of type for convenience
    });
}

// wrap so we can detect refresh token needed
function getter(auth, options, callback)
{
    request.get(options, function(err, res, js) {
        if(err || res.statusCode != 401) return callback(err, res, js);
        tryRefresh(auth, function(err){
            if(err) return callback(err);
            var api = url.parse(options.uri,true);
            api.query.access_token = auth.token.access_token;
            delete api.search; // node url format bug, ignores query!
            options.uri = url.format(api);
            request.get(options, callback); // try again once more
        });
    });
}

function tryRefresh(auth, callback) {
    var options = {
        uri: 'https://accounts.google.com/o/oauth2/token',
        method: 'POST',
        body: querystring.stringify({client_id:auth.appKey,
                        client_secret:auth.appSecret,
                        refresh_token:auth.token.refresh_token,
                        grant_type:'refresh_token'
                       }),
        headers: {'Content-Type':'application/x-www-form-urlencoded'}
    };
    request(options, function(err, res, body){
        var js;
        try {
            if(err) throw err;
            js = JSON.parse(body);
        } catch(E) {
            return callback(E);
        }
        auth.token.access_token = js.access_token;
        return callback();
    });
}

