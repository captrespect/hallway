var url = require('url');
var request = require('request');


/* e.g. input from user: req.url: /v2/athletes/19?access_token=10948902*/
exports.proxy = function(auth, req, res)
{
  var uri = url.parse('http://www.strava.com/api'+req.url);
  uri.query = req.query;
  // trying to mirror everything needed from orig req
  var arg = {method:req.method};
  arg.uri = url.format(uri);
  arg.headers = {};
  if(req.headers['content-type'])
  { // post or put only?
    arg.headers['content-type'] = req.headers['content-type'];
    if(req.headers['content-type'].indexOf('form') > 0) arg.form = req.body;
    else if(req.headers['content-type'].indexOf('json') > 0) arg.json = req.body;
    else arg.body = req.body;
  }
  request(arg).pipe(res);
}
