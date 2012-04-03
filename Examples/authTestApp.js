var querystring = require('querystring');
var express = require('express');
var request = require('request');

var hostUrl = 'http://localhost:8042';
var client_id = 1;
var client_secret = "1secret";
var port = 8043;

var app = express.createServer();

app.get('/', function(req, res) {
  var tw = querystring.stringify({
    client_id: client_id,
    redirect_uri: 'http://localhost:' + port + '/callback',
    service: 'twitter'
  });
  var fb = querystring.stringify({
    client_id: client_id,
    redirect_uri: 'http://localhost:' + port + '/callback',
    service: 'facebook'
  });
  res.send('<html><a href="' + hostUrl + '/oauth/authorize?' + tw + '">auth twitter</a> or <a href="' + hostUrl + '/oauth/authorize?' + fb + '">auth facebook</a></html>');
})

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
    res.send('wahoo! <a href="'+hostUrl+'/awesome?access_token='+body.access_token+'">tokenized test</a>');
  });
});

app.listen(port);

