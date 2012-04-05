/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var serviceManager = require('lservicemanager');
var express = require('express');
var connect = require('connect');
var logger = require('logger');
var authManager = require('authManager');

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


locker.get('/auth/:id/auth', function(req, res) {
  authManager.authIsAuth(req.params.id, req, res);
});

locker.post('/auth/:id/auth', function(req, res) {
  authManager.authIsAuth(req.params.id, req, res);
});

// this is a temporary endpoint for testing
locker.get('/awesome', function(req, res) {
  if(req.awesome) return res.send(req.awesome);
  res.send(false);
});

locker.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  if (airbrake) {
    airbrake.notify(err, function(err, url) {
      if (url) logger.error(url);
    });
  }
  res.send('Something went wrong.', 500);
});

require('./webservice-synclets')(locker);


locker.initAirbrake = function(key) {
  airbrake = require('airbrake').createClient(key);
};

exports.startService = function(port, ip, cb) {
  locker.listen(port, ip, function() {
    cb(locker);
  });
};