/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var serviceManager = require('lservicemanager');
var syncManager = require('syncManager');
var express = require('express');
var connect = require('connect');
var logger = require('logger');
var async = require('async');
var authManager = require('authManager');
var syncManager = require('syncManager');
var profileManager = require('profileManager');
var ijod = require('ijod');
var dMap = require('dMap');

var airbrake;

var locker = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  connect.session({key:'locker.project.id', secret : 'locker'}),
  function(req, res, next) {
    console.error('REQUEST '+req.url);
    return next();
  },
  authManager.provider.oauth(),
  authManager.provider.login(),
  function(req, res, next) {
    if(req.url.indexOf('/auth/') === 0 || req.url.indexOf('/oauth/') === 0 || req.url.indexOf('/static/') === 0 || (req._authsome)) return next();
    res.send(401);
  }
);

// Hosting the js auth api from /static
locker.use(express.static(__dirname + '/static'));

// Authentication callbacks
locker.get('/auth/:id/auth', function(req, res) {
  authManager.authIsAuth(req.params.id, req, res);
});

locker.post('/auth/:id/auth', function(req, res) {
  authManager.authIsAuth(req.params.id, req, res);
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

// return convenient list of all profiles auth'd for this account
locker.get('/services', function(req, res) {
  syncManager.manager.getServices(function(err, services){
    if(err) logger.error("/services failed",err);
    if(!services) return res.send(500);
    res.send(services);
  });
});

// return convenient list of all profiles auth'd for this account
locker.get('/profiles', function(req, res) {
  var profiles = req._authsome.profiles;
  if(!profiles) return res.send(500);
  var ret = {all:[]};
  profiles.forEach(function(item) {
    if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
    ret.all.push(item.profile); // all profiles raw
    var parts = item.profile.split('@');
    ret[parts[1]] = parts[0].toString(); // convenience, top level service->id mapping
  });
  // if no expanded, return immediately
  if(!isTrue(req.query.data)) return res.send(ret);
  ret.data = {};
  async.forEach(ret.all, function(pid, cb){
    console.error("getting ",pid);
    profileManager.authGet(pid, function(err, auth){
      if(err || !auth) return cb(err);
      ret.data[pid] = auth.profile;
      cb();
    });
  }, function(err){
    if(err) logger.error("failed to expaind data for /profiles ",err);
    res.send(ret);
  })
});

// Post out to a service
locker.post('/services/:serviceName/:serviceEndpoint', function(req, res) {
// TODO, add back, doesn't currently work!
//  syncManager.syncNow(req.params.serviceName, req.params.serviceEndpoint, req.body, function() {
    res.send(true);
//  });
});

// Get a set of data from a service + endpoint combo
locker.get('/services/:serviceName/:serviceEndpoint', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) return res.send('missing profile for '+service, 500);
  // construct the base, get the default type for this endpoint
  var base = dMap.defaults(service, req.params.serviceEndpoint) + ':' + pid + '/' + req.params.serviceEndpoint;
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  var written;
  // write out the return array progressively, pseudo-streaming
  res.writeHead(200, {'Content-Type': 'text/javascript'});
  console.error('getRange '+base+' '+JSON.stringify(options));
  ijod.getRange(base, options, function(item) {
    if(!written) res.write('[');
    if(written) res.write(',');
    written = true;
    res.write(JSON.stringify(item));
    written = true;
  }, function(err) {
    // handling errors here is a bit funky
    if(err) logger.error('error sending results for getRange '+base+':',err);
    if(written) return res.end(']');
    return res.end('[]');
  });
});

// Get an individual object (pardon the stupidlication for now)
locker.get('/services/:serviceName/:serviceEndpoint/id/:id', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  if(err) return res.send('complain loudly! '+err, 500);
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) return res.send('missing profile for '+service, 500);
  // construct the base, get the default type for this endpoint
  var base = dMap.defaults(service, req.params.serviceEndpoint) + ':' + pid + '/' + req.params.serviceEndpoint + '#' + req.params.id;
  console.error('getOne '+base);
  ijod.getOne(base, function(err, item) {
    if(err) return res.send(err, 500);
    return res.send(item);
  });
});

// force a synclet to run, mostly internal dev util
locker.get('/services/:serviceName/:serviceEndpoint/run', function(req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  if(err) return res.send('complain loudly! '+err, 500);
  var pid;
  profiles.forEach(function(item) {
    if(item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if(!pid) return res.send('missing profile for '+service, 500);
  // construct the base, get the default type for this endpoint
  var key = pid + '/' + req.params.serviceEndpoint;
  console.error('run '+key);
  syncManager.manager.syncNow(key, function(err) {
    if(err) return res.send(err, 500);
    return res.send(true);
  });
});

// error handling
locker.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  if (airbrake) {
    airbrake.notify(err, function(err, url) {
      if (url) logger.error(url);
    });
  }
  res.send('Something went wrong.', 500);
});


locker.initAirbrake = function(key) {
  airbrake = require('airbrake').createClient(key);
};

exports.startService = function(port, ip, cb) {
  locker.listen(port, ip, function() {
    cb(locker);
  });
};
