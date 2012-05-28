var url = require('url');
var request = require('request');

exports.get = function(auth, req, res)
{
  var uri = url.parse('https://graph.facebook.com'+req.url);
  uri.query = req.query;
  uri.query.access_token = auth.accessToken;
  console.error(url.format(uri));
  request.get({uri:url.format(uri), json:true}).pipe(res);
}