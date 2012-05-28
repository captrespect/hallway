var url = require('url');
var request = require('request');

exports.get = function(auth, req, res)
{
  var tc = require(__dirname+'/twitter_client.js')(auth.consumerKey, auth.consumerSecret);
  req.query.token = auth.token;
  tc.apiCall('GET', req.url, req.query, function(err, js){
      if(err) return res.json(err, 500);
      res.json(js);
  });
}