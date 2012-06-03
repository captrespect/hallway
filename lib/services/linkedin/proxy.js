var querystring = require('querystring');

exports.proxy = function(auth, req, res)
{
  var OAlib = require('oauth').OAuth;
  var OA = new OAlib(null, null, auth.consumerKey, auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
  var url = 'http://api.linkedin.com/v1'+req.url;
  if (req.method.toUpperCase() === 'GET') {
    var qs = querystring.stringify(req.query);
    if (qs)
      url += ('?' + qs);
    return OA.get(
    url
    , auth.token
    , auth.tokenSecret
    , requestCallback(res)
    );
  } else if (req.method.toUpperCase() === 'POST') {
    return OA.post(
      url
    , auth.token
    , auth.tokenSecret
    , JSON.stringify(req.body)
    , 'application/json'
    , requestCallback(res)
    );
  }
  res.send("unsupported",500);
}

function requestCallback(res) {
  return function (error, data, response) {
    Object.keys(response.headers).forEach(function(header) {
      res.header(header, response.headers[header]);
    });
    res.send(data, response.statusCode);
  };
}
