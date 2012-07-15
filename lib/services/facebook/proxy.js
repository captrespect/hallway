var url = require('url');
var request = require('request');

exports.proxy = function(auth, req, res) {
  var uri = url.parse('https://graph.facebook.com' + req.url);
  uri.query = req.query;
  uri.query.access_token = auth.accessToken;

  // Mirror everything needed from the original requesdt
  var arg = {method:req.method};
  arg.uri = url.format(uri);
  if(req.headers['content-type']) {
    req.headers = {'content-type':req.headers['content-type']};
    if (req.headers['content-type'].indexOf('form') > 0) {
      arg.form = req.body;
    } else if (req.headers['content-type'].indexOf('json') > 0) {
      arg.json = req.body;
    } else {
      arg.body = req.body;
    }
  }
  request(arg).pipe(res);
};
