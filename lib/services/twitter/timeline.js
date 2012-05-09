/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var path = require('path');
var tw = require(path.join(__dirname, 'lib.js'));

exports.sync = function(pi, cb) {
  pi.tc = require(path.join(__dirname, 'twitter_client.js'))(pi.auth.consumerKey, pi.auth.consumerSecret);
  var resp = {data:{}, config:{}};
  var since=1;
  var max=0;
  var newest=0;
  // if existing since, start from there
  if (pi.config && pi.config.timelineNewest) newest = pi.config.timelineNewest;
  if (pi.config && pi.config.timelineSince) since = pi.config.timelineSince;
  if (pi.config && pi.config.timelineMax) max = pi.config.timelineMax;
  var arg = {screen_name:pi.auth.profile.screen_name, since_id:since};
  if (max > 0) arg.max_id = max; // we're paging down results
  tw.getTimeline(pi, arg, function(err, js){
    if (err) return cb(err);
    if (!Array.isArray(js)) return cb("no array");
    // find the newest and oldest!
    js.forEach(function(item){
      if (item.id > newest) newest = item.id + 10; // js not-really-64bit crap, L4M30
      if (item.id < max || max == 0) max = item.id;
    });
    if (js.length <= 1 || max <= since) {
      since = newest; // hit the end, always reset since to the newest known
      max = 0; // only used when paging
    }
    var base = 'tweet:'+pi.auth.profile.id+'@twitter/timeline';
    resp.data[base] = js;
    resp.config.timelineNewest = newest;
    resp.config.timelineSince = since;
    resp.config.timelineMax = max;
    if (max > 1) resp.config.nextRun = -1; // run again if paging
    cb(err, resp);
  });
};
