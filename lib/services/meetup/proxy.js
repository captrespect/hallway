/*var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res)
{
  var uri = url.parse('https://api.runkeeper.com'+req.url);
  uri.query = req.query;
  // trying to mirror everything needed from orig req
  var arg = {method:req.method};
  arg.uri = url.format(uri);
  arg.headers = {};
  arg.headers["Authorization"] = "Bearer "+auth.token.access_token;
  arg.headers["Accept"] = req.headers.accept || "application/vnd.com.runkeeper."+req.url.substr(1,1).toUpperCase()+req.url.substr(2).toLowerCase()+"+json";
  if(req.headers['content-type'])
  { // post or put only?
    arg.headers['content-type'] = req.headers['content-type'];
    if(req.headers['content-type'].indexOf('form') > 0) arg.form = req.body;
    else if(req.headers['content-type'].indexOf('json') > 0) arg.json = req.body;
    else arg.body = req.body;
  }
  request(arg).pipe(res);
}
*/
