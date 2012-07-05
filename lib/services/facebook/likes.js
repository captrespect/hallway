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
	var newestObjId = pi.config.newestObjId || 0;
	var since = pi.config.pageLikesSince || 0;
	var errors = [];
  async.waterfall([function(cb){
  	fb.getUrlLikes({id:"me()", accessToken:pi.auth.accessToken, newestUrl:newestUrl},function(err, newUrls){
  		if (newUrls && newUrls[0]) resp.config['newestUrl'] = newUrls[0];
  		if(err) errors.push(err);
		resp.data['url:'+pi.auth.pid+'/url_likes'] = newUrls;
  		cb();
  	});	
  },function(cb){
  	fb.getStreamLikes({id:pi.auth.profile.id, accessToken:pi.auth.accessToken, newestObjId:newestObjId}, function(err, newPosts, newestObjId){
		if (newPosts && newPosts[0]) resp.config['newestObjId'] = newestObjId;
		resp.data['post:'+pi.auth.pid+'/stream_likes'] = newPosts;
		cb();
	});
  }, function(cb){
    fb.getPageLikes({id:"me()", accessToken:pi.auth.accessToken, since:since},function(err, newPages, newSince){
		resp.data['page:'+pi.auth.pid+'/page_likes'] = newPages;
		resp.config['pageLikesSince'] = newSince;
  		cb();
	});
  }], function(){
console.log(resp.config);
    cbDone((errors.length>0)?errors:null, resp);
  });
};
