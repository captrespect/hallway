var querystring = require('querystring');
var express = require('express');
var request = require('request');

var hostUrl = process.argv[2] || 'http://localhost:8042';
var client_id = 1;
var client_secret = "1secret";
var port = 8043;

function getUrl(service) {
  return hostUrl + '/oauth/authorize?' + querystring.stringify({
    client_id: client_id,
    redirect_uri: 'http://localhost:' + port + '/callback',
    service: service
  });
}

var app = express.createServer();

app.get('/', function(req, res) {
  res.send('<html><a href="' + getUrl('twitter') + '">auth twitter</a> or <a href="' + getUrl('facebook') + '">auth facebook</a> or <a href="' + getUrl('instagram') + '">auth instagram</a> or <a href="' + getUrl('foursquare') + '">auth foursquare</a> or <a href="' + getUrl('tumblr') + '">auth tumblr</a> or <a href="' + getUrl('linkedin') + '">auth linkedin</a></html>');
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
    res.send('wahoo! <a href="'+hostUrl+'/profiles?access_token='+body.access_token+'">tokenized test</a>');
  });
});

app.listen(port);

