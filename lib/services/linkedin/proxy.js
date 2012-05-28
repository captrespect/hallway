var querystring = require('querystring');

exports.proxy = function(auth, req, res)
{
  var OAlib = require('oauth').OAuth;
  var OA = new OAlib(null, null, auth.consumerKey, auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
  var url = 'http://api.linkedin.com/v1'+req.url;
  if (req.method.toUpperCase() === 'GET') {
    return OA.get(
      url + '?' + querystring.stringify(req.query)
    , auth.token
    , auth.tokenSecret
    , requestCallback(res)
    );
  } else if (req.method.toUpperCase() === 'POST') {
    return CLIENT.oauth.post(
      url
    , auth.token
    , auth.tokenSecret
    , req.query
    , 'application/json; charset=UTF-8'
    , requestCallback(res)
    );
  }
  res.send("unsupported",500);
}

function requestCallback(res) {
  return function (error, data, response) {
    if (error) return res.send(error, 500);
    var js;
    try {
      js = JSON.parse(data);
    } catch (exc) {
      return res.send(exc, 500);
    }
    res.send(js);
  };
}
