var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res)
{
  var uri = url.parse('https://graph.facebook.com'+req.url);
  uri.query = req.query;
  uri.query.access_token = auth.accessToken;
  // trying to mirror everything needed from orig req
  var arg = {method:req.method};
  arg.uri = url.format(uri);
  if(req.headers['content-type'])
  { // post or put only?
    req.headers = {'content-type':req.headers['content-type']};
    arg.body = req.body;
  }
  arg.json = true;
//  console.error(arg);
  request(arg).pipe(res);
}