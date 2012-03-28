var querystring = require('querystring');
var express = require('express');

var hostUrl = 'http://localhost:8042';
var client_id = 123;
var port = 8043;

var app = express.createServer();

app.get('/', function(req, res) {
  var qs = querystring.stringify({
    client_id: client_id,
    redirect_uri: 'http://localhost:' + port + '/callback',
    service: 'twitter'
  });
  res.send('<html><a href="' + hostUrl + '/oauth/authorize?' + qs + '">auth twitter</a></html>');
})

app.get('/callback', function(req, res) {
  console.error("DEBUG: req", req);
  // would normally do the regular OAuth 2 code --> access token exchange here.
  res.send('wahoo!');
})

app.listen(port);