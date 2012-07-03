var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res)
{
  var uri = url.parse('https://api.meetup.com'+req.url+'?access_token='+auth.access_token);
  uri.query = req.query;
  // trying to mirror everything needed from orig req
  var arg = {method:req.method};
  arg.uri = url.format(uri);
  if(req.headers['content-type'])
  {
    req.headers = {'content-type':req.headers['content-type']};
    if(req.headers['content-type'].indexOf('form') > 0) arg.form = req.body;
    else if(req.headers['content-type'].indexOf('json') > 0) arg.json = req.body;
    else arg.body = req.body;
  }
  request(arg).pipe(res);
}
