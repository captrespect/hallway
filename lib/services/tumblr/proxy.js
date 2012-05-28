exports.proxy = function(auth, req, res)
{
  var tc = require(__dirname+'/tumblr_client.js')(auth.consumerKey, auth.consumerSecret);
  req.query.token = auth.token;
  var p = tc.apiCall(req.method, req.url, req.query, function(err, js){
      if(err) return res.json(err, 500);
      res.json(js);
  });
}