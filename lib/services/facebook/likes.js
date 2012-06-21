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
	var since = pi.config.pageLikesSince || 0;
	//if (!pi.config.streamLikesSince) pi.config.streamLikesSince = 0;
	var resp = {data: {}, config: {}};
    var base = 'page:'+pi.auth.pid+'/page_likes';
	var pages = resp.data[base] = [];
	fb.getPageLikes({id:"me()", accessToken:pi.auth.accessToken, since:since},function(page){
		pages.push(page);
		}, function(err) {
			resp.config = {pageLikesSince: since};
		}, function(timestamp){
			if (timestamp > since){
				since = timestamp;
			}
	});
	since = pi.config.urlLikesSince || 0;
	var urls = resp.data['url:'+pi.auth.pid+'/url_likes'] = [];
	fb.getUrlLikes({id:"me()", accessToken:pi.auth.accessToken, since:since},function(url){
		urls.push(url);
		}, function(err) {
			console.log("almost done!");
			cb(err, resp);
		}	
	);	
};
