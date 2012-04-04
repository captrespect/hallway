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
  var page=1;
  // if existing since, start from there
  if (pi.config && pi.config.mentionsSince) since = pi.config.mentionsSince;
  if (pi.config && pi.config.mentionsPage) page = pi.config.mentionsPage;
  var arg = {screen_name:pi.auth.profile.screen_name, page:page};
  if (page == 1) arg.since_id = since; // only pass in a since if we're at the first page
  tw.getMentions(pi, arg, function(err, js){
    if (err) return cb(err);
    if (!Array.isArray(js)) return cb("no array");
    // page forward or reset to first if hit the end
    page = (js.length === 0) ? 1 : page + 1;
    // find the newest!
    // their api sometimes returns the last one repeatedly, L4M30
    js.forEach(function (item) { if (item.id > since) since = item.id + 10; });
    var base = 'tweet:'+pi.auth.profile.id+'@twitter/mention';
    resp.data[base] = js;
    resp.config.mentionsSince = since;
    resp.config.mentionsPage = page;
    if (page > 1) resp.config.nextRun = -1; // run again if paging
    cb(err, resp);
  });
};
