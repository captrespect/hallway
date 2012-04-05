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

// Get data from a service + endpoint combo
locker.get('/services/:serviceName/:serviceEndpoint', function(req, res) {
  syncManager.getIJOD(req.params.syncletId, req.params.type, false, function(ijod) {
    if(!ijod) return res.send('not found', 404);
    ijod.reqCurrent(req, res);
  });
});

// Get an individual object
locker.get('/services/:serviceName/:serviceEndpoint/:id', function(req, res) {
  syncManager.getIJOD(req.params.serviceName, req.params.serviceEndpoint, false, function(ijod) {
    if(!ijod) return res.send('not found', 404);
    ijod.reqID(req, res);
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