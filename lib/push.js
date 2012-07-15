var async = require('async');
var urllib = require('url');
var request = require('request');
var querystring = require('querystring');
var idr = require('idr');
var dMap = require('dMap');
var logger = require('logger').logger("push");
var ijod = require('ijod');
var entries = require('entries');

var timeout = 15000;
var maxBacklog = 10;

// push used to be called webhooks but it appears that name isn't being used as much anymore, sometimes http notifications too, or subscriptions

// our main entry, end of the pipeline pump, we're after ijod
exports.pump = function(cset, auth, cbDone) {
  if (cset.length == 0) return cbDone();

  // extract all the bases into clumps
  var bases = {};
  var oembeds = {};
  cset.forEach(function(entry){
    var base = idr.toString(idr.base(entry.idr));
    if(base == 'oembed:links/oembed')
    { // index the oembeds for easy lookup, and skip them from pushing
      oembeds[entry.idr] = entry;
      return;
    }
    if(!bases[base]) bases[base] = [];
    bases[base].push(entry);
  });

  // and begins our async cascade
  getRoutes(auth, function(routes){
    // do each isolated clustering in parallel
    logger.debug("ROUTES",routes);
    logger.debug("BASES",bases);
    async.forEach(Object.keys(bases), function(base, cb){
      var rts = routes[base] || []; // any possible exact base matches
      if(routes['*']) routes['*'].forEach(function(route){rts.push(route)}); // any catch-all globals
      async.forEach(rts, function(route, cb2){
        // run bases[base] through ep.options filtering/processing if any
        var set = entries.filter(bases[base], route.options);
        // prep any left, try to type them and include oembed if so
        set.forEach(function(entry){
          entries.typist(entry, base, route.options);
          if(typeof entry.oembed == 'string') entry.oembed = oembeds[entry.oembed];
        });
        logger.debug("pushing",set.length," entries to ",route);
        var args = {
          uri:route.url,
          timeout:timeout,
          body:'['+set.map(function(entry){return entries.toString(entry, route.options)}).join(',')+']',
          headers:{'Content-Type': 'application/json; charset=utf-8'}
        }
        request.post(args, function(err, resp, body){
          var status = resp && resp.statusCode || 500;
          var pushErr = err || body;
          // all good, no backlog, scooby snack time
          if(status == 200 && (!route.backlog || route.backlog.length == 0)) return cb2();

          // optionally async into any backlog if the endpoint is working, otherwise this passes through
          logger.debug("updating saved route entry")
          var backlog = (status == 200 && route.backlog) ? route.backlog : [];
          var stillbroke = [];
          async.forEach(backlog, function(id, cb3){
            // fetch the stored backlog entry
            ijod.getOne(id, function(err, entry){
              if(err || !entry) return cb3(); // is missing?!
              logger.debug("pushing backlog",entry.idr);
              args.body = '['+entry.data.map(function(entry){return entries.toString(entry, options)}).join(',')+']';
              request.post(args, function(err, resp, body){
                if (resp && resp.statusCode == 200) return cb3();
                status = resp && resp.statusCode || 500;
                if(status == 410) return cb3(true); // bombs out!
                pushErr = err || body; // will get saved below
                stillbroke.push(id);
                cb3();
              });
            });
          }, function(){
            var add = [];
            // booooo something failed, save out the exact snapshot in time for the backlog
            if(status != 200 && status != 410) {
              logger.info("failed to push, backlogging",route);
              var blentry = {data:set, at:Date.now()};
              blentry.idr = 'backlog:'+route.app+'/push#'+blentry.at+'_'+Math.random();
              add.push(blentry)
            }
            ijod.batchSmartAdd(add, function(err){
              if (err) return cb2();
              // now update the original routes entry
              // everything else we're updating saved state, so always fetch the newest to update, almost atomic :)
              ijod.getOne(route.idr, function(err, entry){
                // get matching route
                var r = entry && entry.data && entry.data[route.filter];
                if(!r) {
                  // mighta just been bad timing and was deleted already
                  logger.warn("failed to save a backlog",err,route,blentry.idr);
                  return cb2();
                }
                if(!r.backlog) r.backlog = [];
                if(status == 410) {
                  r.disabled = Date.now();
                }else if(status == 200){
                  r.backlog = stillbroke; // from above, any that still failed
                  delete r.lastErr;
                  delete r.lastStatus;
                  delete r.lastAt;
                }else{
                  r.backlog.push(blentry.idr);
                  r.lastErr = pushErr;
                  r.lastStatus = status;
                  r.lastAt = Date.now();
                }
                // all done, save updated routes entry and continue
                logger.debug("saving updated routes entry",entry);
                ijod.batchSmartAdd([entry], function(err){ cb2() });
              });
            });            
          });
        });
      }, cb);
    }, function(){
      logger.debug("push done",Object.keys(bases));
      cbDone(null, cset);    
    });
  });
}

// take a new set of routes and run them the first time
exports.firstRun = function(routes, profiles, cbDone)
{
  logger.debug("first run of routes",routes,profiles);
  async.forEach(Object.keys(routes), function(filter, cb){
    var route = routes[filter];
    // TODO VALIDATE route.url! should go back to app and should def not reference api.singly.com (infinite looping possibility)
    var url = urllib.parse(filter, true);
    var options = entries.options(url.query, url.path);
    var bases = entries.bases(url.path, url.query, profiles);
    if(bases.length == 0)
    {
      route.lastErr = "failed to process filter and find any matches"
      route.disabled = Date.now();
      return cb();
    }
    var set = [];
    var oembeds = [];
    entries.runBases(bases, options, function(entry, base){
      if(!options.type) return set.push(entry);
      // gotta handle type requests specially to do oembeds
      entries.typist(entry, base, options);
      if(!entry.oembed) return logger.warn("missing oembed!",base,entry.idr);
      set.push(entry);
      if(typeof entry.oembed == 'object') return;
      oembeds.push(entry);
    }, function(err){
      if(err) route.lastErr = "internal error: "+err;
      // process any possible oembeds first
      async.forEach(oembeds, function(entry, cb2){
        ijod.getOne(entry.oembed, function(err, oembed) {
          entry.oembed = (oembed && oembed.data && !oembed.data.err) ? oembed.data : "failed";
          if (oembed && !entry.types[oembed.type]) entry.types[oembed.type] = true;
          cb2()
        });
      }, function(){
        // remove any failed oembeds
        if(oembeds.length > 0) set = set.filter(function(entry){ return typeof entry.oembed == 'object' });
        // got the entries, send em!
        // TODO this part should be refactored to a shared function with the pump, and should we save the backlog?
        logger.debug("pushing",set.length," entries to ",route);
        var args = {
          uri:route.url,
          timeout:timeout,
          body:'['+set.map(function(entry){return entries.toString(entry, options)}).join(',')+']',
          headers:{'Content-Type': 'application/json; charset=utf-8'}
        }
        request.post(args, function(err, resp, body){
          var status = resp && resp.statusCode || 500;
          if(status != 200) {
            route.lastErr = err || body;
            route.lastStatus = status;
            route.lastAt = Date.now();            
          }
          cb();
        });
      })
    })
  }, function(){
    logger.debug("done",routes);
    cbDone(null, routes);
  })
}

// convenient breakout to do the async aspects of building a list of routes
function getRoutes(auth, cbDone)
{
  var routes = {};
  if(!auth.apps) return cbDone(routes);

  // go through all the apps auth'd to this profile and extract any possible route bundles stored
  var idrs = {};
  Object.keys(auth.apps).forEach(function(app){
    if(auth.apps[app].accounts) Object.keys(auth.apps[app].accounts).forEach(function(account){
      idrs['routes:'+account+'@'+app+'/push#custom'] = maxBacklog;
    });
    idrs['routes:'+app+'/push#default'] = maxBacklog*10; // give the app-wide one more buffer
  });

  // fetch all the possible routes (getOne is memcached, should always be fast/cheap)
  logger.debug("looking for routes at",idrs);
  async.forEach(Object.keys(idrs), function(id, cb){
    ijod.getOne(id, function(err, entry){
      if(!entry || !entry.data) return cb();
      Object.keys(entry.data).forEach(function(filter){
        var route = entry.data[filter];
        logger.debug("checking route",filter,route);
        // internally track some vars since we operate on each route context
        route.app = idr.parse(entry.idr).host;
        route.idr = entry.idr;
        route.filter = filter;
        if(route.disabled) return;
        if(route.backlog && route.backlog.length > idrs[id]) // set above as maxBacklog threshold
        {
          logger.warn("backlog too large, skipping route ",route);
          return;
        }
        // these are usually an api url to filter or * to match all data as the special case
        if(filter == '*') {
          if(!routes['*']) routes['*'] = [];
          routes['*'].push(route);
        }
        
        // process the filter as a url, add .options, routes[base] each possible base        
        var url = urllib.parse(filter, true);
        if(url.path && url.path.length > 0)
        {
          route.options = entries.options(url.query);
          entries.bases(url.path, url.query, [auth.pid]).forEach(function(base){
            if(!routes[base]) routes[base] = [];
            routes[base].push(route);
          });
        }
      });
      cb();
    });
  }, function(){
    cbDone(routes);
  });
}

