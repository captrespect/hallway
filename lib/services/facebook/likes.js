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


/* Sync with page likes, url likes, and stream likes, which are all handled differently by the 
 * facebook api. Various likes map to different endpoints.
 */
exports.sync = function(pi, cb) {
	var since = pi.config.pageLikesSince || 0;
	var resp = {data: {}, config: {}};
    var base = 'page:'+pi.auth.pid+'/page_likes';
	var pages = resp.data[base] = [];
	fb.getPageLikes({id:"me()", accessToken:pi.auth.accessToken, since:since},function(page){
		pages.push(page);
		}, function(err) {
			resp.config['pageLikesSince'] = since;
		}, function(timestamp){
			if (timestamp > since){
				since = timestamp;
			}
	});
	var newestUrl = pi.config.newestUrl || '';
	var urls = resp.data['url:'+pi.auth.pid+'/url_likes'] = [];
	fb.getUrlLikes({id:"me()", accessToken:pi.auth.accessToken, newestUrl:newestUrl},function(url, count){
		if (count == 0) newestUrl = url.url;
		urls.push(url);
		}, function(err) {
			resp.config['newestUrl'] = newestUrl;
		}	
	);	
	var newestObjID = pi.config.newestObjID || 0;
	fb.getStreamLikes({id:pi.auth.profile.id, accessToken:pi.auth.accessToken, newestObjID:newestObjID},
		function(obj, type){
			var base = type+':'+pi.auth.pid+'/stream_likes'
			resp.data[base].push(obj);
		},
		function(err) {
			resp.config['newestObjID'] = newestObjID;
			cb(err, resp);
		},
		function(object_id){
			newestObjID = object_id;
		}
	);
};
