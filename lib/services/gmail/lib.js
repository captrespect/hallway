var fs = require('fs');
var path = require("path");
var url = require("url");

exports.genericSync = function(url, cbData) {
  console.log("Going to do a generic sync");
  return function(pi, cbFinal) {
    var OAlib = require('oauth').OAuth;
    var OA = new OAlib(null, null, pi.auth.consumerKey, pi.auth.consumerSecret, '1.0', null, 'HMAC-SHA1', null, {'Accept': '*/*', 'Connection': 'close'});
    OA.get(url, pi.auth.token, pi.auth.tokenSecret, function(err, body){
      if(err) return cbFinal(err);
      var js;
      try{ js = JSON.parse(body); }catch(E){ return cbFinal(err); }
      cbData(pi, js, cbFinal);
    });
  };
};

exports.generateAuthString = function(pi) {
  console.log("PI is %j", pi);
  // XXX: This is known ugly for now
  eval(fs.readFileSync(path.join(__dirname, '/sha1.js'))+'');
  eval(fs.readFileSync(path.join(__dirname, 'oauth.js'))+'');

  var oauth_version = "1.0";
  var oauth_timestamp = OAuth.timestamp();
  var oauth_nonce = OAuth.nonce(6); //random nonce?
  var oauth_consumer_key = pi.auth.consumerKey; 
  var oauth_consumer_secret = pi.auth.consumerSecret; 
  var oauth_token = pi.auth.token;
  var oauth_token_secret = pi.auth.tokenSecret;
  var email = pi.auth.pid.substr(0, pi.auth.pid.length - 6);

  var oauth_signature_method = "HMAC-SHA1";
  var method = "GET";
  var action = "https://mail.google.com/mail/b/"+email+"/imap/"; //gmail's request url

  //signature
  var oauth_signature_method = "HMAC-SHA1"; //from https://developers.google.com/google-apps/gmail/oauth_protocol

  //example values for validating signature from     http://oauth.net/core/1.0a/#sig_base_example
  oauth_nonce=Math.random().toString().substr(2);
  oauth_signature_method="HMAC-SHA1";
  oauth_timestamp=parseInt(Date.now()/1000);
  oauth_version="1.0";

  //signature
  var signature_basestring_parameters = {
      oauth_version: oauth_version
      , oauth_consumer_key: oauth_consumer_key
      , oauth_timestamp: oauth_timestamp
      , oauth_nonce: oauth_nonce
      , oauth_token: oauth_token
      , oauth_signature_method: oauth_signature_method
  }

  //var signature_basestring = oauth_consumer_key+"&"+oauth_token_secret;
  var signature_basestring = OAuth.SignatureMethod.getBaseString({method: method, action: action, parameters: signature_basestring_parameters});

  var methodName = oauth_signature_method;
  var signer = OAuth.SignatureMethod.newMethod(methodName, {
                      consumerSecret: oauth_consumer_secret,
                      tokenSecret: oauth_token_secret
                  }
                     );
  console.log("signature_basestring=["+signature_basestring+"]");

  var oauth_signature = signer.getSignature(signature_basestring);

  console.log("oauth_signature=["+oauth_signature+"]");

  oauth_signature=OAuth.percentEncode(oauth_signature);

  console.log("(escaped) oauth_signature=["+oauth_signature+"]"); //prints out tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D as in the [example](http://oauth.net/core/1.0a/#sig_base_example)

  //base-string
  var baseStringDecoded =  "GET"
      + " "
      + "https://mail.google.com/mail/b/"+email+"/imap/"
      + " "
      + "oauth_consumer_key=\""+oauth_consumer_key+"\","
      + "oauth_nonce=\""+oauth_nonce+"\","
      + "oauth_signature=\""+oauth_signature+"\","
      + "oauth_signature_method=\""+oauth_signature_method+"\","
      + "oauth_timestamp=\""+oauth_timestamp+"\","
      + "oauth_token=\""+oauth_token+"\","
      + "oauth_version=\""+oauth_version+"\"";

  console.log("(base)",baseStringDecoded);

  var baseString = new Buffer(baseStringDecoded).toString('base64');
  return baseString;
}

