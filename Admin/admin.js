var express = require('express');
var connect = require('connect');
var ejs = require("ejs");
var auth = require('./lib/auth');

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

var users = [];
users.push({
  "email":"testuser@singly.com",
  "name":"Test User"
});

var apps = [];
apps.push({
  "clientId": "1",
  "clientSecret": "1secret",
  "appName": "Demo App",
  "appDescription": "Something cool",
  "appUrl": "http://localhost:8043",
  "callbackUrl": "http://localhost:8043/callback"
});

app.get("/login", function(req, res) {
  res.render('login', {
    layout: "integral.ejs",
    hideHeader: true
  });
});

app.post("/login", function(req, res) {
  if(auth.validateLogin()) {
    res.redirect('/');
  } else {

  }
});

app.get("/logout", function(req, res) {
  req.logout();
  req.session.destroy();
  res.writeHead(303, { 'Location': this.logoutRedirectPath() });
  res.end();
});

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
