var async = require('async');
var crypto = require('crypto');
var urllib = require('url');
var request = require('request');
var querystring = require('querystring');
var idr = require('idr');
var dMap = require('dMap');
var logger = require('logger').logger("oembed");
var ijod = require('ijod');

var timeout = 10000;
var embedly = "http://api.embed.ly/1/oembed?key=4f95c324c9dc11e083104040d3dc5c07";

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

  // save out each url as a ref to any entries
  var did = {};
  function saver(task, data)
  {
    // first time this is created, insert it!
    if(data && !did[task.url]) {
      logger.debug("saving",task.url,data.type);
      did[task.url] = data;
      var entry = {idr:task.idr, at:Date.now(), data:data, types:{}};
      entry.types[data.type] = true; // need alias saved that is used by original entry
      cset.push(entry); // should be safe since we skip these
    } else {
      data = did[task.url];
    }
    // tag each entry w/ the type'd reference too
    var r = idr.clone(task.idr);
    r.protocol = data.type;
    var typed = idr.toString(r);
    task.entries.forEach(function(entry){
      if(!entry.refs) entry.refs = {};
      entry.refs[typed] = task.url;
      entry.q = [entry.q,data.title].join(" "); // neato
    });
  }
  // worker queue to lookup/save urls
  var doing = {};
  var q = async.queue(function(task, cb){
    // normalized idr for any link
    ijod.getOne(task.idr, function(err, entry) {
      // existing, niiice
      if(entry) {
        did[task.url] = entry.data;
        saver(task);
        return cb();
      }
      // now do oembed, have max timer
      task.timer = setTimeout(function(){
        logger.debug("timing out",task.url);
        task.timer = false;
        saver(task, {type:'link', url:task.url, err:'timeout'}); // save a blank one since it broke
        cb();
      }, timeout*2);
      oembed(task.url, function(data){
        if(task.timer === false) return; // timed out already!
        clearTimeout(task.timer);
        if(!data) data = {err:'oembed'};
        if(typeof data.type != 'string') data.type = 'link';
        if(typeof data.url != 'string') data.url = task.url;
        saver(task, data);
        async.nextTick(cb);
      });
    });
  }, 10);
  q.drain = function(){ callback(null, cset) };
  // only queue up each url if any
  var pushed = false;
  cset.forEach(function(entry){
    if(!entry.refs) return;
    if(refcheck(entry.refs)) return; // idempotent
    Object.keys(entry.refs).forEach(function(url){
      if(url.indexOf('http') != 0) return; // only process http* refs
      var task = {entries: [entry], url:url}
      task.idr = idr.parse('oembed:links/oembed#'+crypto.createHash('md5').update(task.url).digest('hex'));
      // skip ones already done
      if(did[url]) return saver(task);
      // already in the queue, append
      if(doing[url]) return doing[url].entries.push(entry);
      // push a new task on the queue
      doing[url] = task;
      pushed = true;
      q.push(task);
    });
  })
  if(!pushed) q.drain(); // this is a stupid pattern with queues, there should be a better way
}


// basic util to fetch oembed results from known providers, falling back on embedly


var map = { "youtube": [/youtube\.com\/watch.+v=[\w-]+/i , "http://www.youtube.com/oembed"]
    , "flickr": [/flickr\.com\/photos\/.+/i , "http://flickr.com/services/oembed?format=json"]
    , "viddler": [/viddler\.com\/.+/i , "http://lab.viddler.com/services/oembed/?format=json"]
    , "blip": [/blip\.tv\/.+/i , "http://blip.tv/oembed/"]
    , "yfrog": [/yfrog\.com\/.+/i , "http://www.yfrog.com/api/oembed"]
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
          if(err || !body || !body.type) logger.warn("oembed failed",urllib.format(up),err||resp.statusCode);
            if(err || !body || !body.type) return cb(); // continue on to next one
            if(body.type == "image") body.type = "photo"; // yfrog does this, image is not in the spec, dughrhrgggt
            cb(body); // aborts and finishes w/ a result
        });
    }, callback);
}
