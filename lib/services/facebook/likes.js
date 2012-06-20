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
	var pageLikesSince = pi.config.pageLikesSince || 0; //timestamp
	var streamLikesSince = pi.config.streamLikesSince || 0; //newest object id
	var resp = {data: {}, config: {}};
    var base = 'post:'+pi.auth.pid+'/likes';
	var posts = resp.data[base] = [];
	fb.getPageLikes({id:pi.auth.pid, acccessToken:pi.auth.accessToken},function(page){
		posts.push(page);
	}, function(err) {
		cb(err, resp);
	});
};

    
/*
	request.get({uri:uri, json:true, timeout:timeout}, function(err, resp2, js){
        if(err) cb(err);
		if(!resp2) cb('no response');
		if(resp2.statusCode != 200) return cb("status code "+resp2.statusCode+": "+util.inspect(js));
		if(js === null || typeof js != "object" || !Array.isArray(js.data)) return cb("response didn't include a json array: "+util.inspect(js));
		js.data.forEach(function(page){
			if(page.created_time > pageLikesSince) pageLikesSince = page.created_time;
			pages.push(page);
		});
	});
	
	var ids = [];
	pages.forEach(function(page){ids.push(page.id)});
	
	getPosts(ids, function
        
	resp.data[base] = js.data;
	resp.config.likesSince = pageLikesSince;
    cb(err, resp);


	
};
*/
