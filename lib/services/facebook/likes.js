/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*
*/



var fb = require('./lib.js');
var request = require('request');
var util = require('util');
var timeout = 6000;

exports.sync = function(pi, cb) {
	if (!pi.config) pi.config = {};
	if (!pi.config.pageLikesSince) pi.config.pageLikesSince = 0;
	if (!pi.config.streamLikesSince) pi.config.streamLikesSince = 0;
	var resp = {data: {}, config: {}};
    var base = 'post:'+pi.auth.pid+'/likes';
	var posts = resp.data[base] = [];
	fb.getPageLikes({id:"me()", accessToken:pi.auth.accessToken},function(page){
		posts.push(page);
	}, function(err) {
		cb(err, resp);
	}, function(timestamp){
		if (timestamp > pi.config.pageLikesSince) pi.config.pageLikesSince = timestamp;
	}); 
};
