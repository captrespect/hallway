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
  	fb.getUrlLikes({id:"me()", accessToken:pi.auth.accessToken, newestUrl:newestUrl},function(url, count){
  		  if (count == 0) newestUrl = url.url;
  		  urls.push(url);
  		}, function(err) {
  			resp.config['newestUrl'] = newestUrl;
  			if(err) errors.push(err);
  			cb();
  		}
  	);	
  },function(cb){
  	fb.getStreamLikes({id:pi.auth.profile.id, accessToken:pi.auth.accessToken, newestObjID:newestObjID},
  		function(obj){
  			posts.push(obj);
  		},
  		function(err) {
  			resp.config['newestObjID'] = newestObjID;
  			if(err) errors.push(err);
  			cb();
  		},
  		function(object_id){
  			newestObjID = object_id;
  		}
  	);    
  }, function(cb){
    fb.getPageLikes({id:"me()", accessToken:pi.auth.accessToken, since:since},function(page){
    		pages.push(page);
    	}, function(err) {
    		resp.config['pageLikesSince'] = since;
  			if(err) errors.push(err);
  			cb();
    	}, function(timestamp){
  			if (timestamp > since) since = timestamp;
    	});    
  }], function(){
//    console.error(resp);
    cbDone((errors.length>0)?errors:null, resp);
  });
};
