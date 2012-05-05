var async = require('async');
var crypto = require('crypto');
var urllib = require('url');
var request = require('request');
var querystring = require('querystring');
var idr = require('idr');
var dMap = require('dMap');
var logger = require('logger').logger("resolve");

var timeout = 10000;
var embedly = "http://api.embed.ly/1/oembed?key=4f95c324c9dc11e083104040d3dc5c07";

// util to have idr-based index into current changeset
function index(cset)
{
  var ndx = {};
  cset.forEach(function(e){ ndx[idr.toString(e.idr)] = e })
  return ndx;
}

// scan refs to see if we did links already, idempotent assuming we're the only ones making http's
function refcheck(refs)
{
  if(!refs) return false;
  var refa = Object.keys(refs);
  for(var i = 0; i < refa.length; i++) if(refa[i].indexOf('link:') == 0) return true;
  return false;
}

// be as smart as possible to bulk process all urls in a changeset, often they have some affinity
exports.pump = function(cset, callback) {
  var ndx = index(cset); // need an idr-based index of it

  // save out each url as a ref to any entries
  var did = {};
  function saver(task, resolved)
  {
    if(resolved) {
      var url2 = urllib.format(urllib.parse(resolved));
      if(url2.indexOf('http') == 0) did[task.url] = resolved;      
    }
//    logger.debug("resolved",task.url,did[task.url]);
    task.entries.forEach(function(entry){
      if(!entry.refs) entry.refs = {};
      entry.refs[did[task.url] || task.url] = task.url;
    });
  }
  // worker queue to lookup/save urls
  var doing = {};
  var q = async.queue(function(task, cb){
    // max timer for oembed
    task.timer = setTimeout(function(){
      logger.debug("timing out",task.url);
      task.timer = false;
      saver(task, task.url); // save that it broke
      cb();
    }, timeout*2);
    expand({url:task.url}, function(arg){
      if(task.timer === false) return; // timed out already!
      clearTimeout(task.timer);
      if(arg.err) logger.warn("link resolving warning",arg.url,arg.err);
      if(typeof arg.url != 'string') arg.url = task.url; // use original if expansion failed
      saver(task, arg.url);
      cb()
    });
  }, 10);
  q.drain = function(){ callback(null, cset) };
  // only queue up each url if any
  cset.forEach(function(entry){
    if(!entry.refs) return;
    if(refcheck(entry.refs)) return; // idempotent
    entry.refs.forEach(function(url){
      if(url.indexOf('http') != 0) return; // only process http* refs
      // skip ones already done
      if(did[url]) return saver({entries:[entry], url:url});
      // already in the queue, append
      if(doing[url]) return doing[url].entries.push(entry);
      // create a new task
      doing[url] = {entries:[entry], url:url};
      q.push(doing[url]);
    });
  })
}


// basic util to fetch oembed results from known providers, falling back on embedly


var map = { "youtube": [/youtube\.com\/watch.+v=[\w-]+/i , "http://www.youtube.com/oembed"]
    , "flickr": [/flickr\.com\/photos\/.+/i , "http://flickr.com/services/oembed?format=json"]
    , "viddler": [/viddler\.com\/.+/i , "http://lab.viddler.com/services/oembed/?format=json"]
    , "blip": [/blip\.tv\/.+/i , "http://blip.tv/oembed/"]
    , "hulu": [/hulu\.com\/watch\/.+/i , "http://www.hulu.com/api/oembed.json"]
    , "vimeo": [/vimeo\.com\/.+/i , "http://vimeo.com/api/oembed.json"]
    , "dailymotion": [/dailymotion\.com\/.+/i , "http://www.dailymotion.com/api/oembed/"]
    , "scribd": [/scribd\.com\/.+/i , "http://www.scribd.com/services/oembed"]
    , "slideshare": [/slideshare\.net\/.+/i , "http://www.slideshare.net/api/oembed/1"]
//    , "photobucket": [/photobucket\.com\/.+/i , "http://photobucket.com/oembed/"] XXX their oembed endpoint requires cookies and redirects to infinity!
    , "wordpress": [/wordpress\.com\/.*/i , "http://public-api.wordpress.com/oembed/1.0/?for=singly.com"]
};


// the dude wants a fully expanded url
function oembed(url, callback) {
    if(typeof(url) != 'string') return callback();

    var stack = [];

    // try any in our regex url map
    for(var r in map) {
        if(map[r][0].test(url)) stack.push(map[r][1]);
    }

    // hard-wired embedly
    stack.push(embedly);

    if(stack.length == 0) return callback();

    // now try any of the options until one succeeds
    async.forEachSeries(stack, function (u, cb) {
        if(!u) return cb();
        var up = urllib.parse(u, true);
        up.query["url"] = url;
        delete up.search;
        request.get({uri:urllib.format(up), json:true, timeout:timeout, followRedirect:true, maxRedirects:3}, function(err,resp,body) {
            if(err || !body || !body.type) return cb(); // continue on to next one
            cb(body); // aborts and finishes w/ a result
        });
    }, callback);
}
