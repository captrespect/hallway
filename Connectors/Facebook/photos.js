/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fb = require('./lib.js')
  , async = require('async')
  , photos = []
  ;

exports.sync = function(pi, cb) {
    if(!pi.config.albums) pi.config.albums = [];
        if(pi.config.albums.length == 0) return fb.getAlbums({id:"me", accessToken:pi.auth.accessToken}, function(album){ pi.config.albums.push(album); }, function(err) {
        if(pi.config.albums.length > 0) pi.config.nextRun = -1; // immediately start processing them
        return cb(err, pi); // don't return any data
    });
    // now we have albums to process, do one of them!
    pi.data = {photo:[]};
    fb.getAlbum({id:pi.config.albums.pop(), accessToken:pi.auth.accessToken},function(photo){ pi.data.photo.push(photo); }, function(err) {
        if(pi.config.albums.length > 0) pi.config.nextRun = -1; // if there's more to do!
        return cb(err, pi);
    });
};
