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
var authManager = require('authManager');
var accountsManager = require('accountsManager');
var ijod = require('ijod');
var dMap = require('dMap');

var airbrake;

var locker = express.createServer(
    function(req, res, next) {
      console.error('REQUEST '+req.url);
      return next();
      // if(req.url.indexOf('/auth/') === 0 || (req.session.account_id && req.session.account_id !== '')) return next();
      // res.send(401);
    },
  connect.bodyParser(),
  connect.cookieParser(),
  connect.session({key:'locker.project.id', secret : 'locker'}),
  authManager.provider.oauth(),
  authManager.provider.login()
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


// return convenient list of all profiles auth'd for this account
locker.get('/profiles', function(req, res) {
  if(!req.awesome) return res.send({}, 400);
  accountsManager.getProfiles(req.awesome.account, function(err, profiles){
    if(err) logger.error('/profiles failed for ' + JSON.stringify(req.awesome), err);
    if(err) return res.send({}, 500);
    var ret = {all:[]};
    profiles.forEach(function(item) {
      if(!item.profile || item.profile.indexOf('@') == -1) return; // skip any that don't look right
      ret.all.push(item.profile); // all profiles raw
      var parts = item.profile.split('@');
      ret[parts[1]] = parts[0].toString(); // convenience, top level service->id mapping
    });
    res.send(ret);
  });
});

// Post out to a service
locker.post('/services/:serviceName/:serviceEndpoint', function(req, res) {
  syncManager.syncNow(req.params.serviceName, req.params.serviceEndpoint, req.body, function() {
    res.send(true);
  });
});

// Get a set of data from a service + endpoint combo
locker.get('/services/:serviceName/:serviceEndpoint', function(req, res) {
  if(!req.awesome) return res.send('missing or invalid token', 400);
  var service = req.params.serviceName;
  accountsManager.getProfiles(req.awesome.account, function(err, profiles) {
    if(err) return res.send('complain loudly! '+err, 500);
    var pid;
    profiles.forEach(function(item) {
      if(item.profile.indexOf(service) > 0) pid = item.profile;
    });
    if(!pid) return res.send('missing profile for '+service, 500);
    // construct the base, get the default type for this endpoint
    var base = dMap.defaults(service, req.params.serviceEndpoint) + ':' + pid + '/' + req.params.serviceEndpoint;
    var options = {};
    options.start = parseInt(req.query['offset'] || 0);
    options.end = options.start + parseInt(req.query['limit'] || 20);
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
    })
  });
});

// Get an individual object (pardon the stupidlication for now)
locker.get('/services/:serviceName/:serviceEndpoint/id/:id', function(req, res) {
  if(!req.awesome) return res.send('missing or invalid token', 400);
  var service = req.params.serviceName;
  accountsManager.getProfiles(req.awesome.account, function(err, profiles) {
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
});


// this is a temporary endpoint for testing
locker.get('/awesome', function(req, res) {
  if(req.awesome) return res.send(req.awesome);
  res.send(false);
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
