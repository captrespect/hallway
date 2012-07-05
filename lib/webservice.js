/*Copyright (C) 2011, The Locker Project
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
var fs = require('fs');

var airbrake;

var locker = express.createServer(
	{key: fs.readFileSync('/etc/apache2/ssl/server.key'),
  cert: fs.readFileSync('/etc/apache2/ssl/server.crt')},
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
    if(req.url.indexOf('/v0/') == 0) req.url = req.url.substr(3); // for now, everything is v0 by default
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
    res.json(lutil.jsonErr("This request requires an access_token."), 401);
  },
  // enable CORS
  function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Accept, Cache-Control, Pragma, User-Agent, Origin, X-Request, Referer, X-Requested-With, Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
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
    return res.json(lutil.jsonErr("OAuth failed: Missing cookie."), 500);
  }
  logger.debug("authauth here",req.cookies['auth'+req.params.id]);
  authManager.authIsAuth(req.params.id, req.cookies['auth'+req.params.id], req, res);
});

// allows an app to apply their own auth tokens in lieu of the managed auth
locker.get('/auth/:id/apply', function(req, res) {
  authManager.authApply(req.params.id, req, res);
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

function requireJSONBody(req, res, next) {
  console.log(req.body);
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
locker.get('/services', function(req, res) {
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
locker.get('/profiles', function(req, res) {
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
    if(!isTrue(req.query.data)) {
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
    v8bug(ret, res);
  });
});

// a way to make changes to profiles, just delete for now
locker.post('/profiles', function(req, res) {
  var account = req._authsome.account;
  if(!account) {
    return res.json(lutil.jsonErr('That account does not exist.'), 404);
  }
  if(!req.query.delete) {
    return res.json(
      lutil.jsonErr('A "delete" parameter is required.', {
        see: "https://dev.singly.com/profiles#Deleting-Profiles"
      }), 400);
  }

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

// create a new app (primarily for a developer, but could be used for anyone someday)
locker.post('/profiles/:serviceName', requireJSONBody, function(req, res) {
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
locker.get('/profiles/:serviceName', function(req, res) {
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
    if(self.idr && self.data && isTrue(req.query.map)) self.map = dMap.map(self);
    logger.anubis(req);
    if(!isTrue(req.query.auth)) return v8bug(self, res);
    // be nice and return tokens
    profileManager.authGet(pid, req._authsome.app, function(err, auth){
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

  var types = {all:0, all_feed:0};
  var bases = {};
  var pros = req._authsome && profiles(req._authsome.profiles, req.query.services);
  dMap.types(false, pros).forEach(function(type){
    types[type] = 0;
    if(!req._authsome) return;
    dMap.types(type, pros).forEach(function(base){ bases[base] = type });
  });
  if(!req._authsome) return res.json(types);
  // count each base if auth'd
  var options = {};
  doNear(req, options);
  options.q = req.query.q;
  async.forEach(Object.keys(bases), function(base, cb){
    if(base.indexOf('all') == 0) return cb(); // all ones are special
    ijod.getBounds(base, options, function(err, bounds){
      if(!bounds) return cb();
      types[bases[base]] += parseInt(bounds.total);
      var all = (bases[base].indexOf('_feed') > 0) ? 'all_feed' : 'all';
      types[all] += parseInt(bounds.total);
      cb();
    })
  }, function(){
    return res.json(types);
  });
});

// our mega typo
locker.get('/types/:type', function(req, res) {
  var type = req.params.type;
  var profiles = [];

  if (isTrue(req.query.map)) {
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

  req._authsome.profiles.forEach(function(item) {
    if (!item.profile || item.profile.indexOf('@') === -1) {
      // skip any that don't look right
      return;
    }

    var parts = item.profile.split('@');

    if (req.query.services && req.query.services.indexOf(parts[1]) === -1) {
      // services sub-selects just particular ones
      return;
    }

    profiles.push(item.profile); // all profiles raw
  });

  var bases = dMap.types(type, profiles);
  var ret = [];

  if (bases.length === 0) {
    return res.json(ret, 404);
  }

  var tomap = {
    "photos": "photo:links/oembed",
    "news": "link:links/oembed",
    "photos_feed": "photo:links/oembed",
    "news_feed": "link:links/oembed",
    "videos": "video:links/oembed",
    "videos_feed": "video:links/oembed"
  };

  // get the offset/limit for each base
  var options = {};

  options.since = parseInt(req.query['since']) || undefined;
  options.until = parseInt(req.query['until']) || undefined;
  options.limit = 20; // rough default
  options.q = req.query.q;

  if (req.query['min_count']) {
    options.limit = parseInt(req.query['min_count']);
  }

  if (req.query['max_count']) {
    var maxd = parseInt(req.query['max_count'] / bases.length);

    if (maxd < options.limit) {
      // override to enforce an upper bound
      options.limit = maxd;
    }
  }

  if (options.limit < 5) {
    // rough minimum to avoid odd edge cases
    options.limit = 5;
  }

  doNear(req, options);

  logger.debug("TYPE", type,options,bases);

  // get the oldest at
  var oldest;
  var cap = false;

  async.forEach(bases, function(base, cb) {
    ijod.getBounds(base, options, function(err, bounds) {
      if (err || !bounds) {
        return cb();
      }

      if (!oldest) {
        // make sure it's set to something
        oldest = bounds.oldest;
      }

      // only if a full result set
      if (bounds.total >= options.limit) {
        cap = true;
      }

      if (bounds.total >= options.limit && bounds.oldest > oldest) {
        oldest = bounds.oldest;
      }

      cb();
    });
  }, function() {
    if (cap) {
      options.since = oldest - 1; // set max age window for each
    }

    var oembeds = [];

    async.forEach(bases, function(base, cb) {
      ijod.getRange(base, options, function(item) {
        // given the map flag, try to map any known fields
        if (item && item.idr && item.data && isTrue(req.query.map)) {
          item.map = dMap.map(item);
        }

        item.guid = dMap.guid(item);

        if (item.map && item.map.oembed) {
          item.oembed = item.map.oembed;
        }

        // try to dmap an oembed
        if (!item.oembed) {
          // first try to dmap w/ the type'd idr so that the map can override it
          var typed = idr.clone(base);
          var orig = idr.parse(item.idr);

          typed.hash = orig.hash;

          item.oembed = dMap.get('oembed', item.data, typed);

          if (!item.oembed) {
            item.oembed = dMap.get('oembed', item.data, orig);
          }
        }

        // be consistent and always have a type
        if (!item.types) {
          item.types = {};
        }

        if (item.oembed && !item.types[item.oembed.type]) {
          item.types[item.oembed.type] = true;
        }

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
              oembed = true;
            }
          });
        }

        if (!oembed && !item.oembed) {
          return; // oembed is required!
        }

        if (oembed) {
          oembeds.push(item);
        }

        ret.push(item);
      }, cb)
    }, function(err) {
      if (err) {
        logger.error("type fetch error for", type,err);
      }

      if (isTrue(req.query.dedup)) {
        // first sort old->new as oldest is the primary signal
        ret.sort(function(a,b) { return a.at - b.at; });

        var ret2 = [];
        var guids = {};

        ret.forEach(function(item) {
          if (!item.guid) {
            return ret2.push(item);
          }

          guids[item.guid] = true;

          ret2.push(item);
        });

        ret = ret2;
      }

      ret.sort(function(a,b) { return b.at - a.at });

      logger.anubis(req, { count: ret.length });
      logger.debug("cap", cap, "oldest", oldest, "results", ret.length);

      if (oembeds.length == 0) {
        return v8bug(doFields(req.query.fields, ret), res);
      }

      async.forEach(oembeds, function(entry, cb) {
        var id;

        Object.keys(entry.refs).forEach(function(key) {
          if (type == 'all' || key.indexOf(tomap[type]) == 0) {
            id = key;
          }
        });

        if (!id) {
          return cb();
        }

        ijod.getOne(id, function(err, oembed) {
          if (!oembed) {
            return cb();
          }

          entry.oembed = oembed.data;

          if (!entry.types[entry.oembed.type]) {
            entry.types[entry.oembed.type] = true;
          }

          cb();
        })
      }, function() {
        var ret2 = [];

        ret.forEach(function(entry) {
          if (entry.oembed) {
            return ret2.push(entry);
          }

          logger.warn('missing oembed!', entry.id, entry.idr);
        });

        v8bug(doFields(req.query.fields, ret2), res);
      });
    });
  });
});

locker.get('/by/contact/:service/:id', function(req, res) {
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
    profiles.push(item.profile); // all profiles raw
  });
  var bases = dMap.types('contacts', profiles);
  var ret = [];
  var options = {q:id};
  async.forEach(bases, function(base, cb){
    ijod.getRange(base, options, function(item) {
      item.oembed = dMap.get('oembed', item.data, item.idr);
      // if media=true and a photo, return the first one as a friendly thing!
      if(isTrue(req.query.media) && item.oembed && item.oembed.thumbnail_url) return res.redirect(item.oembed.thumbnail_url);
      ret.push(item);
    }, cb);
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

// public health check
var tstart = Date.now();
locker.get('/state', function(req, res) {
  var ret = {};
  ret.uptime = parseInt((Date.now() - tstart)/1000);
  ret.host = require("os").hostname();
  res.send(ret);
});

// get apps for an account
locker.get('/apps', function(req, res) {
  var account = req._authsome.account;
  acl.getAppsForAccount(account, function(err, js) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(js);
  });
});

// get details for a single app
locker.get('/app/:id', function(req, res) {
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
locker.post('/app', requireJSONBody, function(req, res) {
  // make sure to save who created this!
  req.body.account = req._authsome.account;
  acl.addApp(req.body, function(err, js){
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    res.json(js);
  });
});

// delete an app using a post request for old html forms
locker.post('/app/:id', requireJSONBody, function(req, res, next) {
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
locker.post('/app/:id', requireJSONBody, function(req, res) {
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
locker.post('/services/:serviceName/:serviceEndpoint', function(req, res) {
// TODO, add back, doesn't currently work!
//  syncManager.syncNow(req.params.serviceName, req.params.serviceEndpoint, req.body, function() {
    res.json(true);
//  });
});

// Get a set of data from a service + endpoint combo
locker.get('/services/:serviceName/:serviceEndpoint', function(req, res) {
  var service = req.params.serviceName;

  if (isTrue(req.query.map)) {
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

  var profiles = req._authsome.profiles;
  var pid;

  profiles.forEach(function(item) {
    if(item.profile.indexOf('@'+service) > 0) pid = item.profile;
  });

  if(service == req._authsome.app) pid = req._authsome.account+'@'+req._authsome.app;
  if(!pid) {
    return res.json(lutil.jsonErr('There is no profile for ' + service), 404);
  }
  // construct the base, get the default type for this endpoint
  var type = req.query['type'] || dMap.defaults(service, req.params.serviceEndpoint);
  if(!type) return res.json([], 404);
  var base = type + ':' + pid + '/' + req.params.serviceEndpoint;
  var options = {};
  options.since = parseInt(req.query['since']) || undefined;
  options.until = parseInt(req.query['until']) || undefined;
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
  if(!pid || !type) {
    return res.json(lutil.jsonErr('There is no profile for ' + service), 404);
  }

  // construct the base, get the default type for this endpoint
  var base =  type + ':' + pid + '/' + req.params.serviceEndpoint + '#' + req.params.id;
  logger.debug('getOne '+base);
  ijod.getOne(base, function(err, item) {
    if(err) return res.json(lutil.jsonErr(err), 500);
    logger.anubis(req);
    return v8bug(item, res);
  });
});

locker.get("/services/reset", function(req, res) {
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
locker.get('/services/:serviceName', function(req, res) {
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
  var options = {};
  doNear(req, options);
  options.q = req.query.q;
  async.forEach(dMap.bases([pid]),function(base, cb){
    var b = idr.parse(base);
    ijod.getBounds(base, options, function(err, bounds){
      if(bounds) ret[b.path] = bounds.total;
      cb();
    })
  }, function(){
    v8bug(ret, res);
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
locker.get('/id/:id', function(req, res) {
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
  if(id && id.indexOf('_') > 0) id = id.substr(0,id.indexOf('_'));  // for future use, the second part used for sharding hints, possible validation, etc
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
    if(!isTrue(req.query.media)) return v8bug(doFields(req.query.fields,entry), res);
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
locker.all('/proxy/:service/*', function(req, res) {
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
locker.get('/services/:serviceName/:serviceEndpoint/run', function(req, res) {
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
locker.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  // TODO:  Decide if this should go to alerting!
  res.json(
    lutil.jsonErr(
      'Something went wrong. Please report details at https://github.com/Singly/API/issues.'
    ), 500
  );
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
