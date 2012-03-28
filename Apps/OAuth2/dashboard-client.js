/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var express = require('express')
  , connect = require('connect')
  , ejs = require("ejs")
  , locker
  , request = require('request')
  , async = require('async')
  // TODO:  This should not be used in an app
  , lconfig = require('lconfig.js')
  , github = false
  , githubLogin = ''
  , form = require('connect-form')
  , uistate = require(__dirname + '/uistate')
  , profileImage = 'img/default-profile.png'
  , path = require('path')
  , fs = require('fs')
  , util = require("util")
  , lutil = require('lutil')
  , moment = require("moment")
  , page = ''
  , connectSkip = false
  ;

var userGlobals = {
  "email":"tyler@stalder.me",
  "name":"Tyler Stalder",
  "apiToken":"ff07548f8f782d32b5deed2911be38314a9ccd57"
};

ejs.filters.capitalAll = function(obj) {
  return obj.map(function(word) {
    return word.charAt(0).toUpperCase() + word.substr(1);
  });
};

module.exports = function(passedLocker, passedExternalBase, listenPort, callback) {
  lconfig.load('../../Config/config.json');
  locker = passedLocker;
  app.listen(listenPort, function(){ callback(app.address().port); }); // pass back port actually used in case it was 0
};

var app = express.createServer();
app.use(express.cookieParser());

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(form({ keepExtensions: true }));
  app.use(express.static(__dirname + '/static'));
  app.dynamicHelpers({
    dashboard: function(req, res) {
                 return lconfig.dashboard;
               },
    profileImage: function(req, res) {
                    return profileImage;
                  },
    page: function(req, res) {
            return page;
          }
  });
});

app.all('*', function(req, res, next) {
  lutil.avatarUrlFromMap(process.cwd, locker.lockerBase, function (err, url) {
    if (!err) profileImage = url;
  });
  request.get({url:locker.lockerBase + "/synclets/github/getCurrent/profile"}, function(err, res, body) {
    try {
      body = JSON.parse(body);
      if (body[0].login) {
        githubLogin = body[0].login;
      }
    } catch (E) {}
  });
  next();
});

var renderSettings = function(req, res) {
  res.redirect('/dashboard/settings/account');
};

var renderSettingsAccountInformation = function(req, res) {
  res.render('settings-account', {
    user: userGlobals,
    config: {},
    dashboard: lconfig.dashboard
  });
};

var handleSettings = function (req, res, next) {
  if (!req.params || !req.params.avi_url) return res.send('missing parameter', 400);

  var rawAvatar = 'raw-avatar';
  lutil.fetchAndResizeImageURL(
    req.params.avi_url, 'raw-avatar', 'avatar.png',
    function (err, success) {
      if (err) return res.send(err, 500);
      return res.send(success);
    }
  );
};

var renderSettingsAPIKey = function(req, res) {
  res.render('settings-api', {
    dashboard: lconfig.dashboard,
    user: userGlobals
  });
};

var renderSettingsOAuth2 = function(req, res) {
  res.render('settings-oauth2', {
    dashboard: lconfig.dashboard,
    user: userGlobals
  });
};

var sendAvatar = function (req, res) {
  res.sendfile('avatar.png');
};

// Require at least one connection before you can do anything else

//app.get('/', renderSettings);
app.get('/settings', renderSettings);
app.get('/settings/account', renderSettingsAccountInformation);
app.get('/settings/api', renderSettingsAPIKey);
app.get('/settings/oauth2', renderSettingsOAuth2);
