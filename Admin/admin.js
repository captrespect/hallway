var express = require('express');
var connect = require('connect');
var ejs = require("ejs");

var port = 8044;

var app = express.createServer(
    connect.bodyParser(),
    connect.cookieParser(),
    connect.session({key:'locker.project.id', secret : "locker"})
);

var singly = {
  hostUrl: process.env.CAREBEAR_HOST || 'http://localhost:8042',
  client_id: 1,
  client_secret: "1secret"
};

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.static(__dirname + '/static'));
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ secret: "magichash" }));
});

/*
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
*/

app.get("/", function(req, res) {
  res.render('index', {
    laout: false,
    client_id: singly.client_id,
    hostUrl: singly.hostUrl
  });
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

app.get('/callback', function(req, res) {
  // would normally do the regular OAuth 2 code --> access token exchange here.
  var data = {
    client_id: client_id,
    client_secret: client_secret,
    code: req.param('code')
  };
  request.post({uri:hostUrl+'/oauth/access_token', body:querystring.stringify(data), headers:{'Content-Type' : 'application/x-www-form-urlencoded'}}, function (err, resp, body) {
    try {
      body = JSON.parse(body);
    } catch(err) {
      return res.send(err, 500);
    }
    req.session.token = body.access_token;
    //res.send('wahoo! <a href="'+hostUrl+'/awesome?access_token='+body.access_token+'">tokenized test</a>');
    res.send('<script>window.close()</script>');
  });
});

app.get("/apps", function(req, res) {
  res.render('applications');
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
