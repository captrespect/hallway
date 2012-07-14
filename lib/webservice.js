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
var qix = require('qix');
var lutil = require('lutil');
var entries = require('entries');
var os = require('os');

var airbrake;
var tstarted;
var version;
var total;

// Given '/services/types?access_token=foo', return 'services'
var RE_FIRST_SEGMENT = /\/([^?\/]+)/;

var hallway = express.createServer(
  // Everything is v0 by default for now
  function(req, res, next) {
    if (req.url.indexOf('/v0/') === 0)
      req.url = req.url.substr(3);

    next();
  },
  // Log the duration of requests
  function(req, res, next) {
    // TODO/node8: Use process.hrtime()
    var start = Date.now();

    if (res._responseTime)
      return next();

    res._responseTime = true;

    var matches = RE_FIRST_SEGMENT.exec(req.url);
    var type = 'request.duration.unknown';

    if (matches) {
      type = 'request.duration.' + matches[1].replace('.', '-');
    }

    // The header event is undocumented; I also
    // tried end but it never triggered.
    res.on('header', function() {
      // TODO/node8: Use process.hrtime()
      var duration = Date.now() - start;
      var data = {};

      data[type] = duration;

      instruments.timing(data).send();
    });

    next();
  },
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    instruments.increment('api.hits').send();

    logger.debug("REQUEST %s", req.url);

    return next();
  },
  authManager.provider.oauth(),
  authManager.provider.login(),
  function(req, res, next) {
    if(
      req.url.indexOf('/auth/')   === 0 ||
      req.url.indexOf('/oauth/')  === 0 ||
      req.url.indexOf('/static/') === 0 ||
      req.url.indexOf('/enoch')   === 0 ||
      req.url === '/services'           ||
      req.url === '/types'              ||
      req.url === '/state'              ||
      req._authsome
    ) return next();
    if(req.url == '/') return res.redirect('http://dev.singly.com/');
    res.json(lutil.jsonErr("This request requires a valid access_token."), 401);
  },
  // enable CORS
  function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Accept, Cache-Control, Pragma, User-Agent, Origin, X-Request, Referer, X-Requested-With, Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    next();
  },
  // Keep track of total hits for each API host, reported in /state
  function(req, res, next) {
    total++;
    next();
  }
);

// Hosting the js auth api from /static
hallway.use(express.static(__dirname + '/../Ops/static'));

// compress by default (using gzippo until express does this natively)
//hallway.use(require('gzippo').compress());

// Authentication callbacks
hallway.get('/auth/:id/auth/:app', function(req, res) {
  authManager.authIsAuth(req.params.id, req.params.app, req, res);
});

hallway.post('/auth/:id/auth/:app', function(req, res) {
  authManager.authIsAuth(req.params.id, req.params.app, req, res);
});

// fallback to use cookie that was set in oauth init stage in authManager
hallway.get('/auth/:id/auth', function(req, res) {
  if(!req.cookies || !req.cookies['auth'+req.params.id]) {
    logger.warn('missing cookie for fallback auth',req.params.id);
    return res.json(lutil.jsonErr("OAuth failed: Missing cookie."), 500);
  }
  logger.debug("authauth here",req.cookies['auth'+req.params.id]);
  authManager.authIsAuth(req.params.id, req.cookies['auth'+req.params.id], req, res);
});

// allows an app to apply their own auth tokens in lieu of the managed auth
hallway.get('/auth/:id/apply', function(req, res) {
  authManager.authApply(req.params.id, req, res);
});

// Data access endpoints

function requireJSONBody(req, res, next) {
  var parseFailed = false;
  if(typeof req.body === 'string') try {
    req.body = JSON.parse(req.body);
  } catch (E) {
    logger.error("couldn't parse /profiles/* body", req.body);
    parseFailed = true;
  }
  if(parseFailed || typeof req.body !== 'object') {
    return res.json(lutil.jsonErr("POST body must be a JSON object."), 400);
  }
  return next();
}

// PUBLIC! Return convenient list of all available services
hallway.get('/services', function(req, res) {
  instruments.increment([
    'app.services.discovery.base',
    'app.' + (req._authsome ? req._authsome.app : 'public') + '.services.discovery.base'
  ]).send();

  syncManager.manager.getServices(function(err, services){
    if(err) logger.error("/services failed",err);
    if(!services) return res.json(lutil.jsonErr(err), 500);
    res.json(services);
  });
});

// Return convenient list of all profiles auth'd for this account
hallway.get('/profiles', function(req, res) {
  instruments.increment([
    'app.profiles',
    'app.' + req._authsome.app + '.profiles'
  ]).send();

  var profiles = req._authsome.profiles;
  var ret = {};
  ret.id = req._authsome.account;
  async.forEach(profiles, function(item, cb) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    var parts = item.profile.split('@');
    if(!ret[parts[1]]) ret[parts[1]] = [];
    if(!lutil.isTrue(req.query.data)) {
      ret[parts[1]].push(parts[0]);
      return cb();
    }
    profileManager.authGet(item.profile, null, function(err, auth){
      if(err || !auth) return cb(err);
      ret[parts[1]].push(auth.profile);
      cb();
    });
  }, function(err){
    if(err) logger.error("failed to expand data for /profiles ",err);
    logger.anubis(req);
    res.json(ret);
  });
});

// a way to make changes to profiles, just delete for now
hallway.post('/profiles', function(req, res) {
  var account = req._authsome.account;
  if(!account) {
    return res.json(lutil.jsonErr('That account does not exist.'), 404);
  }
  if(!req.query.delete) {
    return res.json(
      lutil.jsonErr('A "delete" parameter is required.', {
        see: "https://dev.singly.com/profiles#Deleting-Profiles"
      }), 400
    );
  }
  if(req.query.delete === account) {
    acl.delProfiles(account, function(err, rows){
      if(err) logger.error(err);
      logger.anubis(req);
      res.json(!err);
    });
  } else {
    acl.getProfile(account, req.query.delete, function(err, profile) {
      if (err) logger.error(err);
      if (!profile) {
        return res.json(lutil.jsonErr('That profile is not connected.'), 404);
      }
      logger.info("deleting account profiles for "+account,req.query.delete,req._authsome.profiles);
      acl.delProfile(account, req.query.delete, function(err, rows){
        if(err) logger.error(err);
        logger.anubis(req);
        res.json(!err);
      });
    });
  }
});

// endpoints for reading/writing push information for this account
hallway.post('/push', requireJSONBody, function(req, res) {
  var entry = {data:req.body, at:Date.now()};
  entry.idr = 'routes:'+req._authsome.account+'@'+req._authsome.app+'/push#custom';
  ijod.batchSmartAdd([entry], function(err){
    if (err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(entry);
  });
});
hallway.get('/push', function(req, res) {
  ijod.getOne('routes:'+req._authsome.account+'@'+req._authsome.app+'/push#custom', function(err, entry) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(entry);
  });
});

// create a new app (primarily for a developer, but could be used for anyone someday)
hallway.post('/profiles/:serviceName', requireJSONBody, function(req, res) {
  var service = req.params.serviceName;
  if(service == 'self') service = req._authsome.app;
  if(service != req._authsome.app) {
    return res.json(lutil.jsonErr("Can't write to " + service), 500);
  }
  // make sure to save who created this!
  var entry = {data:req.body, at:Date.now()};
  entry.idr = 'profile:'+req._authsome.account+'@'+service+'/self#'+req._authsome.account;
  ijod.batchSmartAdd([entry], function(err){
    if (err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(entry);
  })
});

// return the profile for a given service
hallway.get('/profiles/:serviceName', function(req, res) {
  var service = req.params.serviceName;
  if(service == 'self') service = req._authsome.app;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(service == req._authsome.app) pid = [req._authsome.account, req._authsome.app].join('@');
  var type = dMap.defaults(service, 'self');
  if(!pid || !type) {
    return res.json(lutil.jsonErr('There is no profile for ' + service), 404);
  }
  var base =  type + ':' + pid + '/self';
  logger.debug('getRange '+base);
  var self;
  ijod.getRange(base, {limit:1}, function(item) { self=item }, function(err) {
    if(err) logger.warn(err);
    if(!self) return res.json(lutil.jsonErr("No data"), 404);
    logger.anubis(req);
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    if(!lutil.isTrue(req.query.auth)) return res.end(entries.toString(self, entries.options(req.query)));
    // be nice and return tokens
    profileManager.authGet(pid, req._authsome.app, function(err, auth){
      self.auth = {};
      // slightly heuristic
      if(auth && auth.accessToken) self.auth.accessToken = auth.accessToken;
      if(auth && auth.token) self.auth.token = auth.token;
      res.end(entries.toString(self, entries.options(req.query)));
    });
  });
});

// nice discovery mechanism!
hallway.get('/types', function(req, res) {
  instruments.increment([
    'app.types.discovery.base',
    'app.' + (req._authsome ? req._authsome.app : 'public') + '.types.discovery.base'
  ]).send();

  if (req.query.q) {
    instruments.increment([
      'app.features.search',
      'app.' + (req._authsome ? req._authsome.app : 'public') + '.features.search'
    ]).send();
  }

  if (req.query.near) {
    instruments.increment([
      'app.features.geo',
      'app.' + (req._authsome ? req._authsome.app : 'public') + '.features.geo'
    ]).send();
  }

  var types = {};
  var bases = {};
  var pros = req._authsome && profiles(req._authsome.profiles, req.query.services);
  dMap.types(false, pros).forEach(function(type){
    types[type] = 0;
    if(!req._authsome) return;
    dMap.types(type, pros).forEach(function(base){ bases[base] = type });
  });
  if(!req._authsome) return res.json(types);
  // count each base if auth'd
  var options = entries.options(req.query);
  async.forEach(Object.keys(bases), function(base, cb){
    if(base.indexOf('all') == 0) return cb(); // all ones are special
    ijod.getBounds(base, options, function(err, bounds){
      var all = (bases[base].indexOf('_feed') > 0) ? 'all_feed' : 'all';
      if(lutil.isTrue(req.query.rich)){
        if(!types[bases[base]]) types[bases[base]] = {};
        types[bases[base]][base] = bounds || {newest:0, oldest:0, total:0};
        if(!types[all]) types[all] = {};
        types[all][base] = bounds || {newest:0, oldest:0, total:0};
        return cb();
      }
      if(!bounds) return cb();
      types[bases[base]] += parseInt(bounds.total);
      if(!types[all]) types[all] = 0;
      types[all] += parseInt(bounds.total);
      cb();
    })
  }, function(){
    return res.json(types);
  });
});

// our mega typo
hallway.get('/types/:type', function(req, res) {
  var type = req.params.type;

  if (lutil.isTrue(req.query.map)) {
    instruments.increment([
      'app.features.map',
      'app.' + req._authsome.app + '.features.map'
    ]).send();
  }

  if (req.query.fields) {
    instruments.increment([
      'app.features.fields',
      'app.' + req._authsome.app + '.features.fields'
    ]).send();
  }

  if (req.query.near) {
    instruments.increment([
      'app.features.geo',
      'app.' + req._authsome.app + '.features.geo'
    ]).send();
  }

  if (req.query.q) {
    instruments.increment([
      'app.features.search',
      'app.' + (req._authsome ? req._authsome.app : 'public') + '.features.search'
    ]).send();
  }

  instruments.increment([
    'app.types.rollup',
    'app.types.' + type,
    'app.' + req._authsome.app + '.types.rollup',
    'app.' + req._authsome.app + '.types.' + type
  ]).send();

  var bases = entries.bases(req.url, req.query, req._authsome.profiles);
  var ret = [];

  if (bases.length === 0) return res.json(ret, 404);

  var tomap = {
    "photos": "photo:links/oembed",
    "news": "link:links/oembed",
    "photos_feed": "photo:links/oembed",
    "news_feed": "link:links/oembed",
    "videos": "video:links/oembed",
    "videos_feed": "video:links/oembed"
  };

  var options = entries.options(req.query);

  logger.debug("TYPE", type,options,bases);

  var oembeds = [];
  var ret = [];
  var start = Date.now();
  var fin = false;
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.write('[');
  var written = 0;
  function writer()
  { // called whenever there might be more data to write, but ensures it's sequential
    if(ret.length == 0 && fin)
    {
      logger.anubis(req, {count:written});
      logger.debug("writer fin!",written);
      if(lutil.isTrue(req.query.debug))
      {
        if(written > 0) res.write(',');
        res.write(JSON.stringify({options:options, count:written, time:(Date.now() - start)}));
      }
      return res.end(']');
    }
    if(ret.length == 0 || !ret[0].oembed) return;
    if(ret[0].oembed === "failed") return writer(ret.shift()); // oembed lookup failed :(
    if(written > 0) res.write(',');
    written++;
    res.write(entries.toString(ret.shift(), options));
    writer();
  }
  var oq = async.queue(function(item, cb){
    ijod.getOne(item._key, function(err, oembed) {
      delete item._key;
      item.oembed = (oembed && oembed.data && !oembed.data.err) ? oembed.data : "failed";
      if (oembed && !item.types[oembed.type]) item.types[oembed.type] = true;
      if(item.map && !item.map.oembed && oembed) item.map.oembed = item.oembed; // to reduce confusion have it in the map too and make it consistent
      writer();
      cb()
    });
  }, 100);
  entries.runBases(bases, options, function(item, base){
    // first try to dmap w/ the type'd idr so that the map can override it
    var typed = idr.clone(base);
    var orig = idr.parse(item.idr);

    typed.hash = orig.hash;
    item.oembed = dMap.get('oembed', item.data, typed);
    if (!item.oembed) item.oembed = dMap.get('oembed', item.data, orig);

    // handle statuses custom
    if (type == 'statuses' || type == 'statuses_feed' || (item.types && item.types.status)) {
      var text = (item.map && item.map.text) ? item.map.text : dMap.get('text', item.data, item.idr);

      if (!text) {
        return logger.warn("missing text for", item.idr); // bail if none!
      }

      item.oembed = {
        type: 'text',
        text: text
      };
    }

    // if no oembed yet or the one we have isn't the right type,
    // find any ref based oembed and expand them
    var oembed;
    if ((!item.oembed || item.oembed.type != type) && item.refs) {
      Object.keys(item.refs).forEach(function(key) {
        if (type == 'all' || key.indexOf(tomap[type]) == 0) {
          oembed = key;
        }
      });
    }

    if (!oembed && !item.oembed) return; // oembed is required!
    if (oembed) delete item.oembed; // default one is invalid for this type
    ret.push(item);
    if (!oembed) return writer(); // already has .oembed might be writeable
    // async'ly look up the oembed
    item._key = oembed;
    oq.push(item);
  }, function(err){
    if (err) logger.error("type fetch error for", type,err);
    fin = true;
    writer(); // might be last, might be more happening yet, don't care
  });
});

hallway.get('/by/contact/:service/:id', function(req, res) {
  instruments.increment([
    'app.features.by.rollup',
    'app.features.by.contact',
    'app.' + req._authsome.app + '.features.by.rollup',
    'app.' + req._authsome.app + '.features.by.contact'
  ]).send();

  var service = req.params.service;
  var id = req.params.id;
  if(qix.chunk(id).length == 0) return res.json([], 404);
  var profiles = [];
  req._authsome.profiles.forEach(function(item) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    if(item.profile.indexOf(service) > 0) profiles.push(item.profile); // just the service profile
  });
  var bases = dMap.types('contacts', profiles);
  var ret = [];
  var options = entries.options(req.query);
  options.q = id;
  async.forEach(bases, function(base, cb){
    ijod.getRange(base, options, function(item) {
      item.oembed = dMap.get('oembed', item.data, item.idr);
      // if media=true and a photo, return the first one as a friendly thing!
      if(lutil.isTrue(req.query.media) && item.oembed && item.oembed.thumbnail_url) return res.redirect(item.oembed.thumbnail_url);
      ret.push(item);
    }, cb);
  }, function(err) {
    logger.anubis(req, {count:ret.length});
    if(ret.length == 0) return res.json(ret, 404);
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end('['+ret.map(function(entry){return entries.toString(entry, options)}).join(',')+']');
  });
});

hallway.get('/logout', function(req, res) {
  var appId = req._authsome.app;
  var redirectUri;
  res.clearCookie('account-'+appId);
  acl.getApp(appId, function(err, app) {
    if(err) return res.json(lutil.jsonErr(err), 500);

      if (req.query.redirect_uri) {
        redirectUri = req.query.redirect_uri;
      }
      else {
        var redirect = urllib.parse(app.notes.callbackUrl);
        delete redirect.pathname;
        redirectUri = urllib.format(redirect);
      }
      console.log(redirectUri);
      res.redirect(redirectUri);
  });
});

// public health check
hallway.get('/enoch', function(req, res) {
  var good = req.query.true || true;
  var bad = req.query.false || false;
  if(req.query.fail) return res.json(bad, 500);
  dal.query('select true', [], function(err, row) {
    if(err) return res.json(bad, 500);
    if(!row || !row[0] || row[0].TRUE !== '1') return res.json(bad, 500);
    res.json(good)
  });
});

// public state information
hallway.get('/state', function(req, res) {
  var ret = {
    version: version,
    total: total,
    uptime: parseInt((Date.now() - tstarted) / 1000),
    host: require("os").hostname(),
    os: {
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      totalmem: os.totalmem(),
      freemem: os.freemem()
    }
  };

  res.json(ret);
});

// get apps for an account
hallway.get('/apps', function(req, res) {
  var account = req._authsome.account;
  acl.getAppsForAccount(account, function(err, js) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(js);
  });
});

// get details for a single app
hallway.get('/app/:id', function(req, res) {
  var appId = req.params.id;
  var account = req._authsome.account;
  acl.getApp(appId, function(err, app) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    // check to make sure this account owns the app
    if (app && account === app.notes.account) {
      logger.anubis(req);
      res.json(app);
    } else {
      res.json(lutil.jsonErr("Application does not exist"), 404);
    }
  });
});

// create a new app (primarily for a developer, but could be used for anyone someday)
hallway.post('/app', requireJSONBody, function(req, res) {
  // make sure to save who created this!
  req.body.account = req._authsome.account;
  acl.addApp(req.body, function(err, js){
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(js);
  });
});

// delete an app using a post request for old html forms
hallway.post('/app/:id', requireJSONBody, function(req, res, next) {
  var appId = req.params.id;
  // check for special delete field
  if ( req.body.method === 'DELETE') {
    //load the app
    var account = req._authsome.account;
    acl.getApp(appId, function(err, app) {
      if(err) return res.json(lutil.jsonErr(err), 500);
      //check to make sure this account owns the app
      if (account === app.notes.account) {
        acl.deleteApp(appId, function(err) {
          if (err) return res.json(lutil.jsonErr(err), 500);
          logger.anubis(req);
          res.send(200);
        });
      } else {
        res.send(404);
      }
    });
  } else {
    next();
  }
});

// update details for a single app
hallway.post('/app/:id', requireJSONBody, function(req, res) {
  var appId = req.params.id;
  // load the app
  var account = req._authsome.account;
  acl.getApp(appId, function(err, app) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    // check to make sure this account owns the app
    if (app && app.notes && account === app.notes.account) {
      // make sure to save who created this!
      req.body.account = req._authsome.account;
      var notes = req.body;
      var apiKeys = JSON.parse(req.body.apiKeys);
      delete notes.apiKeys;
      acl.updateApp(appId, notes, apiKeys, function(err) {
        if (err) return res.json(lutil.jsonErr(err), 500);
        logger.anubis(req);
        res.send(200);
      });
    } else {
      res.send(404);
    }
  });
});

// Post out to a service
hallway.post('/services/:serviceName/:serviceEndpoint', function(req, res) {
// TODO, add back, doesn't currently work!
//  syncManager.syncNow(req.params.serviceName, req.params.serviceEndpoint, req.body, function() {
    res.json(true);
//  });
});

// Get a set of data from a service + endpoint combo
hallway.get('/services/:serviceName/:serviceEndpoint', function(req, res) {
  var service = req.params.serviceName;

  if (lutil.isTrue(req.query.map)) {
    instruments.increment([
      'app.features.map',
      'app.' + req._authsome.app + '.features.map'
    ]).send();
  }

  if (req.query.fields) {
    instruments.increment([
      'app.features.fields',
      'app.' + req._authsome.app + '.features.fields'
    ]).send();
  }

  if (req.query.near) {
    instruments.increment([
      'app.features.geo',
      'app.' + req._authsome.app + '.features.geo'
    ]).send();
  }

  if (req.query.q) {
    instruments.increment([
      'app.features.search',
      'app.' + (req._authsome ? req._authsome.app : 'public') + '.features.search'
    ]).send();
  }

  instruments.increment([
    'app.services.rollup',
    'app.services.' + service + '.rollup',
    'app.services.' + service + '.' + req.params.serviceEndpoint,
    'app.' + req._authsome.app + '.services.rollup',
    'app.' + req._authsome.app + '.services.' + service + '.rollup',
    'app.' + req._authsome.app + '.services.' + service + '.' + req.params.serviceEndpoint
  ]).send();

  var bases = entries.bases(req.url, req.query, req._authsome.profiles);
  if(bases.length == 0) return res.json(lutil.jsonErr('No data or profile found'), 404);
  var options = entries.options(req.query);
  var written = 0;
  // write out the return array progressively, pseudo-streaming
  logger.debug('services ',bases,options);
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.write('[');
  var start = Date.now();
  entries.runBases(bases, options, function(item) {
    if(written > 0) res.write(',');
    written++;
    res.write(entries.toString(item, options));
  }, function(err) {
    // handling errors here is a bit funky
    if(err) logger.error('error sending results for services',err);
    logger.anubis(req, {count:written});
    if(lutil.isTrue(req.query.debug))
    {
      if(written > 0) res.write(',');
      res.write(JSON.stringify({options:options, count:written, time:(Date.now() - start)}));
    }
    return res.end(']');
  });
});

// Get an individual object (pardon the stupidlication for now)
hallway.get('/services/:serviceName/:serviceEndpoint/:id', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf('@'+service) > 0) pid = item.profile;
  });
  if(service == req._authsome.app) pid = req._authsome.account+'@'+req._authsome.app;
  var type = dMap.defaults(service, req.params.serviceEndpoint);
  if(!pid || !type) {
    return res.json(lutil.jsonErr('There is no profile for ' + service), 404);
  }

  // construct the base, get the default type for this endpoint
  var base =  type + ':' + pid + '/' + req.params.serviceEndpoint + '#' + req.params.id;
  logger.debug('getOne '+base);
  ijod.getOne(base, function(err, item) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(entries.toString(item, entries.options(req.query)));
  });
});

hallway.get("/services/reset", function(req, res) {
  var profiles = req._authsome.profiles;
  var pid;
  async.forEachSeries(profiles, function(item, cb) {
    profileManager.reset(item.profile, function(err) {
      if (err) return res.json(lutil.jsonErr(err), 500);
      var atAt = item.profile.indexOf("@");
      syncManager.flushService(item.profile.substr(atAt + 1), item.profile, cb);
    });
  }, function(err) {
    logger.anubis(req);
    res.send(200);
  });
});


// Return a summary of the endpoints
hallway.get('/services/:serviceName', function(req, res) {
  var service = req.params.serviceName;

  if (req.query.near) {
    instruments.increment([
      'app.features.geo',
      'app.' + (req._authsome ? req._authsome.app : 'public') + '.features.geo'
    ]).send();
  }

  instruments.increment([
    'app.services.discovery.rollup',
    'app.services.discovery.' + service,
    'app.' + req._authsome.app + '.services.discovery.rollup',
    'app.' + req._authsome.app + '.services.discovery.' + service
  ]).send();

  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf('@'+service) > 0) pid = item.profile;
  });
  if(service == req._authsome.app) pid = req._authsome.account+'@'+req._authsome.app;
  if(!pid) {
    return res.json(lutil.jsonErr('There is no profile for ' + service), 404);
  }
  var ret = {};
  var options = entries.options(req.query);
  async.forEach(dMap.bases([pid]),function(base, cb){
    var b = idr.parse(base);
    ijod.getBounds(base, options, function(err, bounds){
      if(lutil.isTrue(req.query.rich))
      {
        ret[b.path] = bounds || {};
        ret[b.path].hash = idr.baseHash(base);
      }else{
        if(bounds) ret[b.path] = bounds.total;
      }
      cb();
    })
  }, function(){
    res.json(ret);
  });
});

// util to xform our legacy _authsome profiles format into something more useful
function profiles(js, services)
{
  var ret = [];
  js.forEach(function(x){
    var parts = x.profile.split('@');
    // if services, it sub-selects just particular ones
    if(services && services.indexOf(parts[1]) === -1) return;
    ret.push(x.profile);
  });
  return ret;
}

// Get a system-wide id uniquely
hallway.get('/id/:id', function(req, res) {
  if (req.query.fields) {
    instruments.increment([
      'app.features.fields',
      'app.' + req._authsome.app + '.features.fields'
    ]).send();
  }

  instruments.increment([
    'app.id',
    'app.' + req._authsome.app + '.id'
  ]).send();

  var id = req.params.id || req.url.substr(1);
  logger.debug("fetching "+id);
  if(id && id.indexOf(':') == -1 && id.indexOf('_') > 0) id = id.substr(0,id.indexOf('_'));  // for future use, the second part used for sharding hints, possible validation, etc
  ijod.getOne(id, function(err, entry) {
    if (err) logger.warn(err);
    if (!entry) return res.json(lutil.jsonErr("ID does not exist."), 404);
    var pid = idr.pid(entry.idr);
    if(pid.indexOf('@') > 0 && profiles(req._authsome.profiles).indexOf(pid) == -1)
    {
      logger.warn("attempt to access unauth'd entry",id,entry.idr);
      return res.json(lutil.jsonErr("ID does not exist."), 404);
    }
    // catch inappropriate logging requests too
    if(pid.indexOf('@') == -1 && entry.idr.indexOf('/anubis') > 0 && pid != req._authsome.app) {
      return res.json(lutil.jsonErr("ID does not exist."), 404);
    }
    logger.anubis(req);
    if(!lutil.isTrue(req.query.media)) {
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(entries.toString(entry, entries.options(req.query)));
      return;
    }
    // when asking for just the media, try to redirect to it, this should probably be a different endpoint not a flag?
    var media = dMap.get('media', entry.data, entry.idr);
    if(media) return res.redirect(media);
    var mediaf = dMap.media(entry);
    if(!mediaf) return res.json(lutil.jsonErr("No media found."), 404);
    profileManager.authGet(idr.pid(entry.idr), req._authsome.app, function(err, auth){
      if(err || !auth) return res.json(lutil.jsonErr("No media found."), 404);
      mediaf(auth, entry, res);
    });
  });
});

// generic proxy-authed-to-service util
hallway.all('/proxy/:service/*', function(req, res) {
  var service = req.params.service;

  instruments.increment([
    'app.proxy.rollup',
    'app.proxy.' + service,
    'app.' + req._authsome.app + '.proxy.rollup',
    'app.' + req._authsome.app + '.proxy.' + service
  ]).send();

  var pid;
  req._authsome.profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) {
    return res.json(lutil.jsonErr('There is no profile for ' + service), 404);
  }
  req.url = '/'+req.params[0];
  delete req.query['access_token'];
  logger.debug("proxy fetching ",req._authsome.app,req.method, service, req.url, req.query, req.body);
  profileManager.authGet(pid, req._authsome.app, function(err, auth){
    if(err || !auth) {
      return res.json(
        lutil.jsonErr("No access token available for " + service),
        401
      );
    }
    var proxy;
    try {
      proxy = require(path.join('services', service, 'proxy.js'));
    } catch (E) {
      logger.warn(E);
      return res.json(
        lutil.jsonErr("No proxy available for ", service),
        501
      );
    }
    logger.anubis(req);
    proxy.proxy(auth, req, res);
  });
});

// force a synclet to run, mostly internal dev util
hallway.get('/services/:serviceName/:serviceEndpoint/run', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) {
    return res.json(
      lutil.jsonErr('There is no profile for ' + service),
      404
    );
  }
  // construct the base, get the default type for this endpoint
  var key = pid + '/' + req.params.serviceEndpoint;
  logger.debug('run '+key);
  syncManager.manager.syncNow(key, function(err) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    return res.json(true);
  });
});

// error handling
hallway.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  // TODO:  Decide if this should go to alerting!
  res.json(
    lutil.jsonErr(
      'Something went wrong. Please report details at https://github.com/Singly/API/issues.'
    ), 500
  );
});


exports.startService = function(port, ip, cb) {
  tstarted = Date.now();
  total = 0;

  lutil.currentRevision(function(err, hash) {
    version = hash;
  });

  hallway.listen(port, ip, function() {
    cb(hallway);
  });
};
