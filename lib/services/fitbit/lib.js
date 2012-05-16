/*
*
* Copyright (C) 2012, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var OAlib = require('oauth').OAuth;

exports.genericSync = function(pather, cbDone) {
  return function(pi, cb) {
    var OA = new OAlib(null, null, pi.auth.consumerKey, pi.auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
    var path = pather(pi);
    if(!path) return cb(null, pi);
    // need foo:bar to make fitbit api work right otehrwie no params appends ? and get BROKEN erro!
    var url = 'http://api.fitbit.com/1/user/-/'+path;
    OA.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
      if(err) return cb(err);
      var js;
      try{ js = JSON.parse(body); }catch(E){ return cb(err); }
      cbDone(pi, js, cb);
    });
  };
};
