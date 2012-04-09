var querystring = require('querystring');
var express = require('express');
var request = require('request');
var ejs = require('ejs');

var hostUrl = 'http://localhost:8042';
var client_id = 1;
var client_secret = "1secret";
var port = 8043;

var app = express.createServer();

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ secret: "magichash" }));
});

app.get('/', function(req, res) {
  res.render('index', {
    layout:false,
    token: req.session.token,
    profiles: req.session.profiles
  });
});

app.get('/user', function(req, res) {
  request.get({uri:hostUrl+'/profiles?access_token=' + req.session.token}, function(err, resp, body) {
    req.session.profiles = JSON.parse(body);
    res.end(JSON.stringify({
      profiles:req.session.profiles,
      token: req.session.token
    }));
  });
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

app.listen(port);

