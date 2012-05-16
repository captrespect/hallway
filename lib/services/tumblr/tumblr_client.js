 var url = require('url')
   , http = require('http')
   , OAuth = require('oauth').OAuth
   , querystring = require('querystring')
   , memoize = {};
var serializer = require('serializer');

function getCookie(serial, req)
{
  var ret = {}
  if(req.cookies && req.cookies["tumblr_client"])
  {
    try {
      ret = serial.parse(req.cookies["tumblr_client"]);
    }catch(E){}
  }
  return ret;
}
function setCookie(serial, res, js)
{
  var opaque = serial.stringify(js);
  res.cookie('tumblr_client', opaque, { path: '/', httpOnly: false });
}


 module.exports = function (key, secret, callbackURI) {
   if (memoize[key + secret + callbackURI]) {
     return memoize[key + secret + callbackURI];
   }

   var CLIENT = {
     callbackURI: callbackURI,
     key: key,
     oauth: new OAuth(
       'http://www.tumblr.com/oauth/request_token'
     , 'http://www.tumblr.com/oauth/access_token'
     , key
     , secret
     , '1.0'
     , callbackURI
     , 'HMAC-SHA1'
     , null
     , {'Accept': '*/*', 'Connection': 'close'}
     ),
     serializer: serializer.createSecureSerializer(secret, secret)
   }

     , _rest_base = 'http://api.tumblr.com/v2';

   memoize[key + secret + callbackURI] = CLIENT;


   /* Does an API call to tumblr and callbacks
    * when the result is available.
    *
    * @param {String} method
    * @param {String} path
    * @param {Object} params
    * @param {Function} callback
    * @return {Request}
    */
   CLIENT.apiCall = function (method, path, params, callback) {
     var token = params.token;

     delete params.token;

     function requestCallback(callback) {
       return function (error, data, response) {
         if (error) {
           callback(error, null);
         } else {
           try {
             callback(null, JSON.parse(data));
           } catch (exc) {
             callback(exc, null);
           }
         }
       };
     }

     if (method.toUpperCase() === 'GET') {
       return CLIENT.oauth.get(
         _rest_base + path + '?' + querystring.stringify(params)
       , token.oauth_token
       , token.oauth_token_secret
       , requestCallback(callback)
       );
     } else if (method.toUpperCase() === 'POST') {
       return CLIENT.oauth.post(
         _rest_base + path
       , token.oauth_token
       , token.oauth_token_secret
       , params
       , 'application/json; charset=UTF-8'
       , requestCallback(callback)
       );
     }
   };

   /* Redirects to tumblr to retrieve the token
    * or callbacks with the proper token
    *
    * @param {Request} req
    * @param {Response} res
    * @param {Function} callback
    */
   CLIENT.getAccessToken = function (req, res, callback) {

     var parsed_url = url.parse(req.url, true)
       , protocol = req.socket.encrypted ? 'https' : 'http'
       , has_token = parsed_url.query && parsed_url.query.oauth_token;
     var sess = getCookie(CLIENT.serializer, req);
     var has_secret = sess && sess.tumblr_oauth_token_secret;

     // Acces token
     if (has_token &&  has_secret) {

       CLIENT.oauth.getOAuthAccessToken(
         parsed_url.query.oauth_token,
         sess.tumblr_oauth_token_secret,
         parsed_url.query.oauth_verifier,
         function (error, oauth_token, oauth_token_secret, additionalParameters) {
           if (error) {
             callback(error, null);
           } else {
             callback(null, {oauth_token: oauth_token, oauth_token_secret: oauth_token_secret});
           }
         }
       );

     // Request token
     } else {
       CLIENT.oauth.getOAuthRequestToken(
         { oauth_callback: CLIENT.callbackURI },
         function (error, oauth_token, oauth_token_secret, oauth_authorize_url, additionalParameters) {
           if (!error) {
             sess.tumblr_redirect_url = req.url;
             sess.tumblr_oauth_token_secret = oauth_token_secret;
             sess.tumblr_oauth_token = oauth_token;
             setCookie(CLIENT.serializer, res, sess);
             res.redirect('http://www.tumblr.com/oauth/authorize?oauth_token=' + oauth_token);
           } else {
             callback(error, null);
           }
         }
       );
     }
   };

   return CLIENT;
 };