/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var express = require('express');
var connect = require('connect');
var logger = require('logger').logger("webservice");
var async = require('async');
var path = require('path');
var crypto = require('crypto');
var urllib = require('url');
var authManager = require('authManager');
var syncManager = require('syncManager');
var profileManager = require('profileManager');
var ijod = require('ijod');
var pipeline = require('pipeline');
var dMap = require('dMap');
var acl = require('acl');
var idr = require('idr');
var instruments = require("instruments");
var dal = require('dal');

var airbrake;

var locker = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    instruments.increment("api.hits").send();
    logger.debug("REQUEST %s", req.url);
    return next();
  },
  authManager.provider.oauth(),
  authManager.provider.login(),
  function(req, res, next) {
    if(req.url.indexOf('/v0/') == 0) req.url = req.url.substr(3); // for now, everything is v0 by default
    if(req.url.indexOf('/auth/') === 0 || req.url.indexOf('/oauth/') === 0 || req.url.indexOf('/static/') === 0 || req.url == '/services' || req.url.indexOf('/enoch') == 0 || (req._authsome)) return next();
    if(req.url == '/') return res.redirect('http://dev.singly.com/');
    res.json('missing token',401);
  },
  // enable CORS
  function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  }
);

// Hosting the js auth api from /static
locker.use(express.static(__dirname + '/../Ops/static'));

// compress by default (using gzippo until express does this natively)
//locker.use(require('gzippo').compress());

// Authentication callbacks
locker.get('/auth/:id/auth/:app', function(req, res) {
  authManager.authIsAuth(req.params.id, req.params.app, req, res);
});

locker.post('/auth/:id/auth/:app', function(req, res) {
  authManager.authIsAuth(req.params.id, req.params.app, req, res);
});

// fallback to use cookie that was set in oauth init stage in authManager
locker.get('/auth/:id/auth', function(req, res) {
  if(!req.cookies || !req.cookies['auth'+req.params.id]) {
    logger.warn('missing cookie for fallback auth',req.params.id);
    return res.send("handshake failed, missing cookie, spilled milk!",500);
  }
  logger.debug("authauth here",req.cookies['auth'+req.params.id]);
  authManager.authIsAuth(req.params.id, req.cookies['auth'+req.params.id], req, res);
});


// Data access endpoints

// simple util for consistent but flexible binary options
function isTrue(field)
{
  if(!field) return false;
  if(field === true) return true;
  if(field == "true") return true;
  if(field == "1") return true;
  if(field == "yes") return true;
  return false;
}

// workaround for v8/node6 see https://github.com/Singly/API/issues/35
function v8bug(js, res)
{
  var str = JSON.stringify(js);
  var len = str.length;
  str = str.replace(/[\u0080-\uffff]/g, function(ch) {
    var code = ch.charCodeAt(0).toString(16);
    while (code.length < 4) code = "0" + code;
    return "\\u" + code;
  });
  if(!res) return str;
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.write(str);
  res.end();
}

// PUBLIC! return convenient list of all profiles auth'd for this account
locker.get('/services', function(req, res) {
  syncManager.manager.getServices(function(err, services){
    if(err) logger.error("/services failed",err);
    if(!services) return res.json('sorry '+err, 500);
    res.json(services);
  });
});

// return convenient list of all profiles auth'd for this account
locker.get('/delay', function(req, res) {
  var ret = {ms:0, count:0};
  var re = (req.query.match) ? new RegExp(req.query.match) : false;
  Object.keys(pipeline.delayz).forEach(function(base){
    if(re && !base.match(re)) return;
    ret.count++;
    ret.ms += pipeline.delayz[base];
  });
  ret.avg = parseInt(ret.ms / ret.count);
  res.json(ret);
  logger.debug(pipeline.delayz);
});

// return convenient list of all profiles auth'd for this account
locker.get('/profiles', function(req, res) {
  var profiles = req._authsome.profiles;
  if(!profiles) return res.json('no profiles found', 404);
  var ret = {};
  ret.id = req._authsome.account;
  async.forEach(profiles, function(item, cb) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    var parts = item.profile.split('@');
    if(!ret[parts[1]]) ret[parts[1]] = [];
    if(!isTrue(req.query.data)) {
      ret[parts[1]].push(parts[0]);
      return cb();
    }
    profileManager.authGet(item.profile, function(err, auth){
      if(err || !auth) return cb(err);
      ret[parts[1]].push(auth.profile);
      cb();
    });
  }, function(err){
    if(err) logger.error("failed to expand data for /profiles ",err);
    logger.anubis(req);
    v8bug(ret, res);    
  });
});

// a way to make changes to profiles, just delete for now
locker.post('/profiles', function(req, res) {
  var account = req._authsome.account;
  if(!account) return res.json('no account', 404);
  if(!req.query.delete) return res.json('no delete= in the query string', 404);

  logger.info("deleting account profiles for "+account,req.query.delete,req._authsome.profiles);
  // delete all if the id is the account
  if(req.query.delete === account)
  {
    acl.delProfiles(account, function(err, rows){
      if(err) logger.error(err);
      logger.anubis(req);
      res.json(true);
    });    
    return;
  }
  acl.delProfile(account, req.query.delete, function(err, rows){
    if(err) logger.error(err);
    logger.anubis(req);
    res.json(true);
  });
});

// return the profile for a given service
locker.get('/profiles/:serviceName', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  var type = dMap.defaults(service, 'self');
  if(!pid || !type) return res.json('missing profile for '+service, 404);
  var base =  type + ':' + pid + '/self';
  logger.debug('getRange '+base);
  var self;
  ijod.getRange(base, {limit:1}, function(item) { self=item }, function(err) {
    if(!self) return res.json(false, 404);
    if(self.idr && self.data && isTrue(req.query.map)) self.map = dMap.map(self);
    logger.anubis(req);
    if(!isTrue(req.query.auth)) return v8bug(self, res);
    // be nice and return tokens
    profileManager.authGet(pid, function(err, auth){
      self.auth = {};
      // slightly heuristic
      if(auth && auth.accessToken) self.auth.accessToken = auth.accessToken;
      if(auth && auth.token) self.auth.token = auth.token;
      v8bug(self, res);
    });
  });
});

// nice discovery mechanism!
locker.get('/types', function(req, res) {
  if(!req._authsome.profiles) return res.json('no profiles found', 404);
  var profiles = [];
  req._authsome.profiles.forEach(function(item) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    profiles.push(item.profile); // all profiles raw
  });
  var types = {all:{}, all_feed:{}};
  dMap.types(false, profiles).forEach(function(type){ types[type] = {} });
  res.json(types);
});

// our mega typo
locker.get('/types/:type', function(req, res) {
  var type = req.params.type;
  if(!req._authsome.profiles) return res.json('no profiles found', 404);
  var profiles = [];
  req._authsome.profiles.forEach(function(item) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    profiles.push(item.profile); // all profiles raw
  });
  var bases = dMap.types(type, profiles);
  var ret = [];
  if(bases.length == 0) return res.json(ret, 404);

  var tomap = {"photos":"photo:links/oembed", "news":"link:links/oembed", "photos_feed":"photo:links/oembed", "news_feed":"link:links/oembed", "videos":"video:links/oembed", "videos_feed":"video:links/oembed"};
  // get the offset/limit for each base
  var options = {}
  options.since = parseInt(req.query['since']) || undefined;
  options.until = parseInt(req.query['until']) || undefined;
  options.limit = 20; // rough default
  if(req.query['min_count']) options.limit = parseInt(req.query['min_count']);
  if(req.query['max_count']) {
    var maxd = parseInt(req.query['max_count'] / bases.length);
    if(maxd < options.limit) options.limit = maxd; // override to enforce an upper bound
  }
  if(options.limit < 5) options.limit = 5; // rough minimum to avoid odd edge cases
  doNear(req, options);
  logger.debug("TYPE",type,options,bases);
  // get the oldest at
  var oldest;
  var cap = false;
  async.forEach(bases, function(base, cb){
    ijod.getBounds(base, options, function(err, bounds){
      if(err || !bounds) return cb();
      if(!oldest) oldest = bounds.oldest; // make sure it's set to something
      // only if a full result set 
      if(bounds.total >= options.limit) cap = true;
      if(bounds.total >= options.limit && bounds.oldest > oldest) oldest = bounds.oldest;
      cb();
    });
  }, function(){
    if(cap) options.since = oldest - 1; // set max age window for each
    var oembeds = [];
    async.forEach(bases, function(base, cb){
      ijod.getRange(base, options, function(item) {
        // given the map flag, try to map any known fields
        if(item && item.idr && item.data && isTrue(req.query.map)) item.map = dMap.map(item);
        item.guid = dMap.guid(item);
        if(item.map && item.map.oembed) item.oembed = item.map.oembed;
        // try to dmap an oembed
        if(!item.oembed)
        {
          // first try to dmap w/ the type'd idr so that the map can override it
          var typed = idr.clone(base);
          var orig = idr.parse(item.idr);
          typed.hash = orig.hash;
          item.oembed = dMap.get('oembed', item.data, typed);
          if(!item.oembed) item.oembed = dMap.get('oembed', item.data, orig);
        }
        // be consistent and always have a type
        if(!item.types) item.types = {};
        if(item.oembed && !item.types[item.oembed.type]) item.types[item.oembed.type] = true;
        // handle statuses custom
        if(type == 'statuses' || type == 'statuses_feed' || (item.types && item.types.status))
        {
          var text = (item.map && item.map.text) ? item.map.text : dMap.get('text', item.data, item.idr);
          if(!text) return logger.warn("missing text for ",item.idr); // bail if none!
          item.oembed = {type:'text', text:text};
        }
        // if no oembed yet or the one we have isn't the right type, find any ref based oembed and expand them
        var oembed;
        if((!item.oembed || item.oembed.type != type) && item.refs) Object.keys(item.refs).forEach(function(key){ if(type == 'all' || key.indexOf(tomap[type]) == 0) oembed = true });
        if(!oembed && !item.oembed) return; // oembed is required!
        if(oembed) oembeds.push(item);
        ret.push(item)
      }, cb)
    }, function(err){
      if(err) logger.error("type fetch error for "+type,err);
      if(isTrue(req.query.dedup))
      {
        // first sort old->new as oldest is the primary signal
        ret.sort(function(a,b){return a.at - b.at});
        var ret2 = [];
        var guids = {};
        ret.forEach(function(item){
          if(!item.guid) return ret2.push(item);
          guids[item.guid] = true;
          ret2.push(item);
        });
        ret = ret2;
      }
      ret.sort(function(a,b){return b.at - a.at});
      logger.anubis(req, {count:ret.length});
      logger.debug("cap",cap,"oldest",oldest,"results",ret.length);
      if(oembeds.length == 0) return v8bug(doFields(req.query.fields,ret), res);
      var startTime = Date.now();
      async.forEach(oembeds, function(entry, cb){
        var id;
        Object.keys(entry.refs).forEach(function(key){ if(type == 'all' || key.indexOf(tomap[type]) == 0) id = key; });
        if(!id) return cb();
        ijod.getOne(id, function(err, oembed) {
          if(!oembed) return cb();
          entry.oembed = oembed.data;
          if(!entry.types[entry.oembed.type]) entry.types[entry.oembed.type] = true;
          cb();
        })
      }, function(){
        var ret2 = [];
        ret.forEach(function(entry){
          if(entry.oembed) return ret2.push(entry);
          logger.warn('missing oembed!',entry.id,entry.idr);
        })
        v8bug(doFields(req.query.fields,ret2), res);
      });
    });
  });
});

// EXPERIMENTAL!
locker.get('/by/url', function(req, res) {
  var url = req.query.url;
  if(!url || !req._authsome.profiles) return res.json([], 404);
  url = urllib.format(urllib.parse(url));
  var id = crypto.createHash('md5').update(url).digest('hex');
  var profiles = [];
  req._authsome.profiles.forEach(function(item) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    profiles.push(item.profile); // all profiles raw
  });
  var bases = dMap.types('all_feed', profiles);
  var ret = [];
  async.forEach(bases, function(base, cb){
    base += '#' + id;
    logger.debug(base);
    ijod.getOne(base, function(err, item) {
      if(item) ret.push(item);
      cb();
    });
  }, function(err) {
    logger.anubis(req, {count:ret.length});
    if(ret.length == 0) return res.json(ret, 404);
    v8bug(ret, res);
  });
});

locker.get('/by/contact/:service/:id', function(req, res) {
  var service = req.params.service;
  var id = req.params.id;
  if(!req._authsome.profiles) return res.json([],404);
  var profiles = [];
  req._authsome.profiles.forEach(function(item) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    profiles.push(item.profile); // all profiles raw
  });
  var bases = dMap.types('contacts', profiles);
  var ret = [];
  async.forEach(bases, function(base, cb){
    base += '#' + id;
    logger.debug(base);
    ijod.getOne(base, function(err, item) {
      if(!item) return cb();
      item.oembed = dMap.get('oembed', item.data, item.idr);
      // if media=true and a photo, return the first one as a friendly thing!
      if(isTrue(req.query.media) && item.oembed && item.oembed.thumbnail_url) return res.redirect(item.oembed.thumbnail_url);
      ret.push(item);
      cb();
    });
  }, function(err) {
    logger.anubis(req, {count:ret.length});
    if(ret.length == 0) return res.json(ret, 404);
    v8bug(ret, res);
  });
});

// public health check
locker.get('/enoch', function(req, res) {
  var good = req.query.true || true;
  var bad = req.query.false || false;
  if(req.query.fail) return res.json(bad, 500);
  dal.query('select true', [], function(err, row) {
    if(err) return res.json(bad, 500);
    if(!row || !row[0] || row[0].TRUE !== '1') return res.json(bad, 500);
    res.json(good)
  });
});

// get apps for an account
locker.get('/apps', function(req, res) {
  var account = req._authsome.account;
  acl.getAppsForAccount(account, function(err, js) {
    if(err) return res.json(err, 500);
    logger.anubis(req);
    res.json(js);
  });
});

// get details for a single app
locker.get('/app/:id', function(req, res) {
  var app = req.params.id;
  acl.getApp(app, function(err, js) {
    if(err) return res.json(err, 500);
    logger.anubis(req);
    res.json(js);
  });
});

// create a new app (primarily for a developer, but could be used for anyone someday)
locker.post('/app', function(req, res) {
  if(typeof req.body == 'string') try {
    req.body = JSON.parse(req.body);
  } catch (E) {
    logger.error("couldn't parse /app body", req.body);
    return res.json("invalid boody :(", 500);
  }
  if(typeof req.body != 'object') return res.json("body is wrong type (diet?)",500);
  // make sure to save who created this!
  req.body.account = req._authsome.account;
  acl.addApp(req.body, function(err, js){
    if(err) return res.json(err, 500);
    logger.anubis(req);
    res.json(js);
  });
});

// delete an app using a post request for old html forms
locker.post('/app/:id', function(req, res, next) {
  var appId = req.params.id;
  if(typeof req.body == 'string') try {
    req.body = JSON.parse(req.body);
  } catch (E) {
    logger.error("couldn't parse /app body", req.body);
    return res.json("invalid boody :(", 500);
  }
  if(typeof req.body != 'object') return res.json("body is wrong type (diet?)",500);
  // check for special delete field
  if ( req.body.method === 'DELETE') {
    acl.deleteApp(appId, function(err) {
      if (err) return res.josn(err, 500);
      logger.anubis(req);
      res.send(200);
    });
  } else {
    next();
  }
});

// update details for a single app
locker.post('/app/:id', function(req, res) {
  var appId = req.params.id;
  if(typeof req.body == 'string') try {
    req.body = JSON.parse(req.body);
  } catch (E) {
    logger.error("couldn't parse /app body", req.body);
    return res.json("invalid boody :(", 500);
  }
  if(typeof req.body != 'object') return res.json("body is wrong type (diet?)",500);
  // load the app
  acl.getApp(appId, function(err, app) {
    if(err) return res.json(err, 500);
    // check to make sure this account owns the app
    if (req._authsome.account === app.notes.account) {
      // make sure to save who created this!
      req.body.account = req._authsome.account;
      acl.updateApp(appId, req.body,  function(err) {
        if (err) return res.json(err, 500);
        logger.anubis(req);
        res.send(200);
      });
    } else {
      res.send(404);
    }
  });
});

// Post out to a service
locker.post('/services/:serviceName/:serviceEndpoint', function(req, res) {
// TODO, add back, doesn't currently work!
//  syncManager.syncNow(req.params.serviceName, req.params.serviceEndpoint, req.body, function() {
    res.json(true);
//  });
});

// Get a set of data from a service + endpoint combo
locker.get('/services/:serviceName/:serviceEndpoint', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf('@'+service) > 0) pid = item.profile;
  });
  if(service == req._authsome.app) pid = req._authsome.account+'@'+req._authsome.app;
  if(!pid) return res.json('missing profile for '+service, 404);
  // construct the base, get the default type for this endpoint
  var type = req.query['type'] || dMap.defaults(service, req.params.serviceEndpoint);
  if(!type) return res.json([], 404);
  var base = type + ':' + pid + '/' + req.params.serviceEndpoint;
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  doNear(req, options);
  options.q = req.query.q;
  var written = 0;
  // write out the return array progressively, pseudo-streaming
  logger.debug('getRange '+base+' '+JSON.stringify(options));
  var skips = {};
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.write('[');
  ijod.getRange(base, options, function(item) {
    if(skips[item.idr]) return;
    skips[item.idr] = true;
    if(written > 0) res.write(',');
    written++;
    // given the map flag, try to map any known fields
    if(item.idr && item.data && isTrue(req.query.map)) item.map = dMap.map(item);
    item.guid = dMap.guid(item);
    // skip obvious dups, happens
    res.write(v8bug(doFields(req.query.fields,item)));
  }, function(err) {
    // handling errors here is a bit funky
    if(err) logger.error('error sending results for getRange '+base+':',err);
    logger.anubis(req, {count:written});
    return res.end(']');
  });
});

// Get an individual object (pardon the stupidlication for now)
locker.get('/services/:serviceName/:serviceEndpoint/:id', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf('@'+service) > 0) pid = item.profile;
  });
  if(service == req._authsome.app) pid = req._authsome.account+'@'+req._authsome.app;
  var type = dMap.defaults(service, req.params.serviceEndpoint);
  if(!pid || !type) return res.json('missing profile for '+service, 404);
  // construct the base, get the default type for this endpoint
  var base =  type + ':' + pid + '/' + req.params.serviceEndpoint + '#' + req.params.id;
  logger.debug('getOne '+base);
  ijod.getOne(base, function(err, item) {
    if(err) return res.json(err, 500);
    logger.anubis(req);
    return v8bug(item, res);
  });
});

locker.get("/services/reset", function(req, res) {
  var profiles = req._authsome.profiles;
  var pid;
  if (profiles.length == 0) return res.json("Missing profiles", 404);
  async.forEachSeries(profiles, function(item, cb) {
    profileManager.reset(item.profile, function(err) {
      if (err) return res.send(err, 500);
      var atAt = item.profile.indexOf("@");
      syncManager.flushService(item.profile.substr(atAt + 1), item.profile, cb);
    });
  }, function(err) {
    logger.anubis(req);
    res.send(200);
  });
});


// Return a summary of the endpoints
locker.get('/services/:serviceName', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf('@'+service) > 0) pid = item.profile;
  });
  if(service == req._authsome.app) pid = req._authsome.account+'@'+req._authsome.app;
  if(!pid) return res.json('missing profile for '+service, 404);
  var ret = {};
  async.forEach(dMap.bases([pid]),function(base, cb){
    var b = idr.parse(base);
    ijod.countBase(base, function(count){
      ret[b.path] = count;
      cb();
    })
  }, function(){
    v8bug(ret, res);
  });
});

// Get a system-wide id uniquely
locker.get('/id/:id', function(req, res) {
  var id = req.params.id || req.url.substr(1);
  logger.debug("fetching "+id);
  if(id && id.indexOf('_') > 0) id = id.substr(0,id.indexOf('_'));  // for future use, the second part used for sharding hints, possible validation, etc
  ijod.getOne(id, function(err, entry) {
    if (err) logger.warn(err);
    if (!entry) return res.json("not found",404);
    logger.anubis(req);
    if(!isTrue(req.query.media)) return v8bug(doFields(req.query.fields,entry), res);
    var media = dMap.get('media', entry.data, entry.idr);
    if(media) return res.redirect(media);
    var mediaf = dMap.media(entry);
    if(!mediaf) return res.send("couldn't find any media",404);
    profileManager.authGet(idr.pid(entry.idr), function(err, auth){
      if(err || !auth) return res.send("media lookup failed", 404);
      mediaf(auth, entry, res);
    });
  });
});

// generic proxy-authed-to-service util
locker.get('/proxy/:service/*', function(req, res) {
  var service = req.params.service;
  var pid;
  req._authsome.profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) return res.json('missing profile for '+service, 404);
  req.url = '/'+req.params[0];
  delete req.query['access_token'];
  logger.debug("proxy fetching "+service,req.url,req.query);
  profileManager.authGet(pid, function(err, auth){
    if(err || !auth) return res.json("missing stored auth info", 404);
    var proxy;
    try {
      proxy = require(path.join('services', service, 'proxy.js'));
    } catch (E) {
      console.error(E);
      return res.json('no proxy for this service',404);
    }
    proxy.get(auth, req, res);
  });  
});
locker.post('/proxy/:service/*', function(req, res) {
  var service = req.params.service;
  var pid;
  req._authsome.profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) return res.json('missing profile for '+service, 404);
  req.url = '/'+req.params[0];
  delete req.query['access_token'];
  logger.debug("proxy posting "+service,req.url,req.query);
  profileManager.authGet(pid, function(err, auth){
    if(err || !auth) return res.json("missing stored auth info", 404);
    var proxy;
    try {
      proxy = require(path.join('services', service, 'proxy.js'));
    } catch (E) {
      console.error(E);
      return res.json('no proxy for this service',404);
    }
    proxy.post(auth, req, res);
  });  
});

// force a synclet to run, mostly internal dev util
locker.get('/services/:serviceName/:serviceEndpoint/run', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) return res.json('missing profile for '+service, 404);
  // construct the base, get the default type for this endpoint
  var key = pid + '/' + req.params.serviceEndpoint;
  logger.debug('run '+key);
  syncManager.manager.syncNow(key, function(err) {
    if(err) return res.json(err, 500);
    return res.json(true);
  });
});

// error handling
locker.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  // TODO:  Decide if this should go to alerting!
  res.json('Something went wrong.', 500);
});


exports.startService = function(port, ip, cb) {
  locker.listen(port, ip, function() {
    cb(locker);
  });
};

// recursize
function fieldz(parts, data) {
  if(parts.length == 0) return data;
  if(typeof data != 'object') return null;
  if(Array.isArray(data)) {
    var any = []
    for(var i=0; i < data.length; i++) {
      var ret = fieldz(parts, data[i]);
      if(ret) any.push(ret);
    }
    return any.length > 0 ? any : null;
  }
  if(data[parts[0]]) return fieldz(parts.slice(1),data[parts[0]]);
  return null;
}

// wrap and parse fields and data stuffs
function doFields(fields, data) {
  // if we're returning an array do each
  if(Array.isArray(data)) {
    var ret = [];
    data.forEach(function(each){
      ret.push(doFields(fields,each));
    });
    return ret;
  }
  if(!fields) return data;
  var ret = {};
  fields.split(',').forEach(function(field){
    ret[field] = fieldz(field.split('.'),data);
  });
  return ret;
}

// utility 
function doNear(req, options)
{
  if(!req.query.near) return;
  var ll = req.query.near.split(",");
  var lat = parseFloat(ll[0]);
  var lng = parseFloat(ll[1]);
  var within = parseFloat(req.query.within||10); // kilometers
  if(typeof within != 'number' || isNaN(within) || typeof lat != 'number' || isNaN(lat) || typeof lng != 'number' || isNaN(lng) ) return;
  var diff = (Math.asin(Math.sin((within / 6371) / 2)) * 2) / Math.PI * 180; // radians, bounding box
  options.box = {lat:[lat+diff, lat-diff], lng:[lng+diff, lng-diff]};
  // TODO someday use actual circle or poly filter of results to make them even more accurate :)  
}
