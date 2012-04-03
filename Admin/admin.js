var url = require("url");
var http = require('http');
var request = require('request');
var express = require('express');
var connect = require('connect');
var path = require('path');
var fs = require("fs");
var querystring = require("querystring");
var lfs = require(__dirname + "/../Common/node/lfs.js");
var httpProxy = require('http-proxy');
var async = require('async');

// base req
var express = require('express');
var connect = require('connect');
var ejs = require("ejs");

var port = 8044;

var app = express.createServer(
    connect.bodyParser(),
    connect.cookieParser(),
    connect.session({key:'locker.project.id', secret : "locker"})
);

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.static(__dirname + '/static'));
  app.use(express.bodyParser());
});

var userGlobals = {
  "email":"testuser@singly.com",
  "name":"Test User",
  "clientId": "1",
  "clientSecret": "1secret",
  "appName": "Demo App",
  "appDescription": "Something cool",
  "appUrl": "http://localhost:8043",
  "callbackUrl": "http://localhost:8043/callback"
};

app.get("/settings", function(req, res) {
  res.render('settings', {
    user: userGlobals
  });
});

app.post("/settings", function(req, res) {
  if (!req.body) return res.send('missing parameter', 400);
  Object.keys(req.body).forEach(function(key) {
    userGlobals[key] = req.body[key];
  });
  res.redirect('back');
});

app.listen(port);
