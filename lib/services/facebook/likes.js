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
var async = require('async');


/* Sync with page likes, url likes, and stream likes, which are all handled differently by the 
 * facebook api. Various likes map to different endpoints.
 */
exports.sync = function(pi, cbDone) {
	var resp = {data: {}, config: {}};

	var newestUrl = pi.config.newestUrl || '';
	var urls = resp.data['url:'+pi.auth.pid+'/url_likes'] = [];
	var newestObjID = pi.config.newestObjID || 0;
	var since = pi.config.pageLikesSince || 0;
	var pages = resp.data['page:'+pi.auth.pid+'/page_likes'] = [];
	var posts = resp.data['post:'+pi.auth.pid+'/stream_likes'] = [];
	var errors = [];

  async.waterfall([function(cb){
  	fb.getUrlLikes({id:"me()", accessToken:pi.auth.accessToken, newestUrl:newestUrl},function(err, newUrls){
  		if (newUrls && newUrls[0]) resp.config['newestUrl'] = newUrls[0];
  		if(err) errors.push(err);
		urls = newUrls;
  		cb();
  	});	
  },function(cb){
  	fb.getStreamLikes({id:pi.auth.profile.id, accessToken:pi.auth.accessToken, newestObjID:newestObjID}, function(err, newPosts){
		posts = newPosts;
		cb();
	});
  }, function(cb){
    fb.getPageLikes({id:"me()", accessToken:pi.auth.accessToken, since:since},function(err, newPages, newSince){
    	pages = newPages;
		resp.config['pageLikesSince'] = newSince;
  		cb();
	});
  }], function(){
    cbDone((errors.length>0)?errors:null, resp);
  });
};
