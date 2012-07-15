/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var fb = require('./lib.js');

exports.sync = function (pi, cb) {
  if (!pi.config.albums) pi.config.albums = [];
  if (!pi.config.albumSince) pi.config.albumSince = 0;
  pi.data = {};
  var base = 'photo:'+pi.auth.pid+'/photos';
  var photos = pi.data[base] = [];

  // If we don't have any albums yet, fetch them
  if (pi.config.albums.length === 0) return checkAlbums(pi, cb);

  // Otherwise, process one
  var album = pi.config.albums.pop();
  fb.getAlbum({
    id          : album.object_id,
    since       : album.since,
    accessToken : pi.auth.accessToken
  }, function (photo) {
    photos.push(photo);
  }, function (err) {
    // Are there more albums?
    pi.config.nextRun = (pi.config.albums.length > 0) ? -1 : null;
    return cb(err, pi);
  });
};

// Modifies the pi.config object
function checkAlbums(pi, callback) {
  fb.getAlbums({
    accessToken : pi.auth.accessToken,
    albumSince  : pi.config.albumSince
  }, function(err, albums) {
    if(err || albums.length === 0) return callback(err, pi);
    var origSince = pi.config.albumSince; // preserve!

    albums.forEach(function(album){
      if(album.modified > pi.config.albumSince) {
        pi.config.albumSince = album.modified; // Track newest
      }
      album.since = origSince; // What is oldest last known timestamp?
      pi.config.albums.push(album);
    });
    pi.config.nextRun = -1; // There's work to do

    // Fetch the album objects too
    var ids = [];
    albums.forEach(function(album){
      ids.push(album.object_id);
    });

    fb.getObjects({
      ids:ids,
      accessToken:pi.auth.accessToken
    }, function(err, list){
      if(list) pi.data['album:' + pi.auth.pid + '/albums'] = list;
      callback(null, pi);
    });
  });
}

