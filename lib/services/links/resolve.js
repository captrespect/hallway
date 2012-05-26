var async = require('async');
var urllib = require('url');
var request = require('request');
var querystring = require('querystring');
var idr = require('idr');
var dMap = require('dMap');
var logger = require('logger').logger("resolve");

var timeout = 5000;

// scan refs to see if we did links already, idempotent assuming we're the only ones making http's
function refcheck(refs)
{
  if(!refs) return false;
  var refa = Object.keys(refs);
  for(var i = 0; i < refa.length; i++) if(refa[i].indexOf('http') == 0) return true;
  return false;
}

// be as smart as possible to bulk process all urls in a changeset, often they have some affinity
exports.pump = function(cset, callback) {
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
  // worker queue to expand individual urls for an entry
  var doing = {};
  var q = async.queue(function(task, cb){
    // max timer
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
  var pushed = false;
  cset.forEach(function(entry){
    var urls = dMap.get('urls', entry.data, entry.idr);
    if(!urls) return;
    if(refcheck(entry.refs)) return; // idempotent
    urls.forEach(function(url){
      // normalize and sanity
      url = urllib.format(urllib.parse(url));
      if(url.indexOf('http') != 0) return;
      // skip ones already in this changeset, helps a lot
      if(did[url]) return saver({entries:[entry], url:url});
      // already in the queue, append
      if(doing[url]) return doing[url].entries.push(entry);
      // create a new task
      doing[url] = {entries:[entry], url:url};
      pushed = true;
      q.push(doing[url]);
    });
  });
  if(!pushed) q.drain(); // this is a stupid pattern with queues, there should be a better way
}


// inspired by unshortener.js

var map = {
    isgd: ['is.gd'],
    googl: ['goo.gl'],
    budurl: ['budurl.com'],
    snipurl: ['snipurl.com', 'snurl.com', 'snurl.com', 'cl.lk', 'snipr.com', 'sn.im']
};

var timeout = 5000;

function expand(args, callback) {
    if(!args || !args.url || typeof(args.url) != 'string') return callback(args);

    // set up defaults
    if(!args.depth) args.depth = 0;
    if(!args.seen) args.seen = {};

    // if we've recursed too far, bail
    if(args.depth > 5) return callback(args);

    // if we've seen this url already, loop bail!
    if(args.seen[args.url]) return callback(args);
    args.seen[args.url] = true;

    // does it parse?
    args.urlp = urllib.parse(args.url);
    if(!args.urlp) return callback(args);

    // only process http stuff, are there any https shorteners?
    if(args.urlp.protocol != 'http:') return callback(args);

    // ok, now process a url!
    args.depth++;

    // do we have a custom api call for it?
    for (var k in map) {
        if (map[k].indexOf(args.urlp.host) > -1) return APIs[k](args, callback);
    }

    // none, fall back to generic HEAD request
    return APIs.generic(args, callback);
}


var APIs = {

    // all of these try to recurse on any result, or any error fall back to generic HEAD request

    isgd: function (args, callback) {
        var url = 'http://is.gd/forward.php?' + querystring.stringify({format: 'json', shorturl: args.urlp.pathname.replace('/', '')});
        request.get({url:url, timeout:timeout, json:true}, function(err, res, body){
            if(body && body.url) {
                args.url = body.url;
                return expand(args, callback);
            }
            return APIs.generic(args, callback);
        });
    },

    googl: function (args, callback) {
        var url = 'https://www.googleapis.com/urlshortener/v1/url?'+querystring.stringify({shortUrl: args.urlp.href});
        request.get({url:url, timeout:timeout, json:true}, function(err, res, body){
            if(body && body.longUrl) {
                args.url = body.longUrl;
                return expand(args, callback);
            }
            return APIs.generic(args, callback);
        });
    },

    budurl: function (args, callback) {
        var url = 'http://budurl.com/api/v1/budurls/expand?'+querystring.stringify({budurl: args.urlp.pathname.replace('/', '')});
        request.get({url:url, timeout:timeout, json:true}, function(err, res, body){
            if(body && body.long_url) {
                args.url = body.long_url;
                return expand(args, callback);
            }
            return APIs.generic(args, callback);
        });
    },

    snipurl: function (args, callback) {
        var url = 'http://snipurl.com/resolveurl?'+querystring.stringify({id: args.urlp.pathname.replace('/', '')});
        request.get({url:url, timeout:timeout}, function(err, res, body){
            if(body) {
                args.url = body;
                return expand(args, callback);
            }
            return APIs.generic(args, callback);
        });
    },

    generic: function (args, callback) {
        var headers = (args.urlp.host === "t.co")?{}:{'User-Agent': 'AppleWebKit/525.13 (KHTML, like Gecko) Safari/525.13.'}; // t.co returns meta refresh if browser!
        if(args.headers && args.headers['set-cookie']) headers['Cookie'] = args.headers['set-cookie']; // really dumb hack to enable cookie-tracking redirectors
        headers['Connection'] = 'close'; // workaround to fix Parser Error's after the request, see https://github.com/joyent/node/issues/2997
        var req = request.head({url:args.url, headers:headers, followRedirect:false, timeout:timeout, agent:false}, function(err, res){
            if(err) { args.err = err; return callback(args); }
            // process a redirect
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)
            {
                // re-basing like a browser would, yes sam, this happens
                if(!res.headers.location) { args.err = 'missing location header on a 3xx'; return callback(args); }
                var newup = urllib.parse(urllib.resolve(args.urlp,urllib.parse(res.headers.location)));
                // if the url is unparseable, bail out
                if (!newup || !newup.pathname) return callback(args);
                // if we're redirected to a login page, bail, kinda lame heuristic here but it works pretty well!
                if(newup.pathname.indexOf("login") > 0 && newup.pathname.indexOf("login") < 10) return callback(args);
                args.url = urllib.format(newup);
                args.headers = res.headers; // convenience for callback
                return expand(args, callback);
            }
            args.headers = res.headers; // convenience for callback
            // everything else, we're done done!
            return callback(args);
        });
        /* this is double-erroring due to or related to https://github.com/joyent/node/issues/2997
        req.on('error',function(err){
          logger.error("request error",err);
          args.err = err;
          callback(args);
        });*/
    }
};

