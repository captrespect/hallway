var async = require('async');
var urllib = require('url');
var request = require('request');
var querystring = require('querystring');
var idr = require('idr');
var dMap = require('dMap');
var logger = require('logger').logger("push");

var timeout = 15000;
var maxBacklog = 10;

// push used to be called webhooks but it appears that name isn't being used as much anymore, sometimes http notifications too, or subscriptions

// our main entry, end of the pipeline pump, we're after ijod
exports.pump = function(cset, auth, cbDone) {
  if (cset.length == 0) return cbDone();

  // extract all the bases into clumps
  var bases = {};
  cset.forEach(function(entry){
    var base = idr.pid(entry.idr);
    if(!bases[base]) bases[base] = [];
    bases[base].push(entry);
  });

  // and begins our async cascade
  getEndpointers(auth, function(endpointers){
    // do each isolated clustering in parallel
    async.forEach(Object.keys(bases), function(base, cb){
      var eps = endpointers[base] || []; // any possible exact base matches
      if(endpointers['*']) endpointers['*'].forEach(function(ep){eps.push(ep)}); // any catch-all globals
      async.forEach(eps, function(ep, cb2){
        // XXX run bases[base] through ep.options filtering/processing if any
        var entries = bases[base];
        logger.debug("pushing",entries.length," entries to ",ep);
        request.post({uri:ep.url, json:entries, timeout:timeout}, function(err, resp, body){
          // XXX if fails, write set to app's backlog, authGet(app) fresh! append REF, set error, authSet()
          cb2();
        });
      }, cb);
    }, function(){
      logger.debug("push done",Object.keys(bases));
      cbDone(null, cset);    
    });
  });
}

// convenient breakout to do the async aspects of building a list of endpointers
function getEndpointers(auth, cb)
{
  var endpointers = {};
  if(!auth.apps) return cb(endpointers);

  // find any custom per-profile push endpoints
  // TODO stored per-account or per-profile, who rectifies?
  Object.keys(auth.apps).forEach(function(app){
    if(auth.apps[app].push) Object.keys(auth.apps[app].push).forEach(function(key){
      var ep = auth.apps[app].push[key];
      ep.app = app;
      if(ep.backlog && ep.backlog.length > maxBacklog)
      {
        logger.warn("backlog too large, skipping endpoint ",key,"for app",app);
        return;
      }
      // these are usually an api url to filter or * to match all data as the special case
      if(key == '*') {
        if(!endpointers['*']) endpointers['*'] = [];
        endpointers['*'].push(ep);
      }
      // XXX process the key as a url, add .options, endpointers[base] each possible base
    })
  });
  cb(endpointers);
}
