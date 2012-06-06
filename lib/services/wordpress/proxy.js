var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res)
{
  var uri = url.parse('https://public-api.wordpress.com/rest/v1'+req.url);
  uri.query = req.query;
  uri.query.access_token = auth.accessToken;
  // trying to mirror everything needed from orig req
  var arg = {method:req.method};
  arg.headers = {authorization:'Bearer '+auth.token.access_token}
  arg.uri = url.format(uri);
  if(req.headers['content-type'])
  {
    if(req.headers['content-type'].indexOf('form') > 0) arg.form = req.body;
    else if(req.headers['content-type'].indexOf('json') > 0) arg.json = req.body;
    else {
      arg.body = req.body;
      arg.headers['content-type'] = req.headers['content-type'];
    }
  }
  request(arg).pipe(res);
}