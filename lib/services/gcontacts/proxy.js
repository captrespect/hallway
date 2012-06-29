exports.proxy = function(auth, req, res)
{
  getClient(auth).getFeed('https://www.google.com/m8/feeds'+req.url, req.query, function(err, result) {
      res.send(result);
  });
}

function getClient(auth) {
  var gdataClient = require('gdata-js')(auth.appKey || auth.clientID, auth.appSecret || auth.clientSecret, auth.redirectURI);
  gdataClient.setToken(auth.token);
  return gdataClient;
}
