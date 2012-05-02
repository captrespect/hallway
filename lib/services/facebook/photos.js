/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var fb = require('./lib.js');
var async = require('async');

exports.sync = function (pi, cb) {
  if (!pi.config.albums) pi.config.albums = [];
  if (!pi.config.albumSince) pi.config.albumSince = 0;
  pi.data = {};
  var base = 'photo:'+pi.auth.pid+'/photos';
  var photos = pi.data[base] = [];

  // we're bi-modal, either get a list of albums, or photos from an album per-run
  if (pi.config.albums.length === 0) return checkAlbums(pi, cb);

  // now we have albums to process, do one of them!
  var album = pi.config.albums.pop();
  fb.getAlbum({id:album.object_id, since:album.since, accessToken:pi.auth.accessToken},
              function (photo) { photos.push(photo); },
              function (err) {
                pi.config.nextRun = (pi.config.albums.length > 0) ? -1 : null; // if there's more to do!
                return cb(err, pi);
  });
};

// modifies the pi.config object
function checkAlbums(pi, callback) {
  fb.getFQL({accessToken:pi.auth.accessToken, fql:"SELECT object_id, modified FROM album WHERE owner=me() AND modified > "+pi.config.albumSince}, function(err, albums) {
    if(err || albums.length == 0) return callback(err, pi);
    var origSince = pi.config.albumSince; // preserve!
    albums.forEach(function(album){
      if(album.modified > pi.config.albumSince) pi.config.albumSince = album.modified; // track newest
      album.since = origSince; // what is oldest last known timestamp?
      pi.config.albums.push(album);
    });
    pi.config.nextRun = -1; // gots shit to do now
    var abdata = pi.data['album:'+pi.auth.pid+'/albums'] = [];
    // fetch the album objects too
    async.forEachSeries(albums, function(album, cb){
      fb.getObject({id:album.object_id,accessToken:pi.auth.accessToken}, function(err, obj){
        if(obj) abdata.push(obj);
        cb();
      });
    }, function(){
      callback(null, pi);      
    })
  })
}

