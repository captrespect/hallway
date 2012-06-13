module.exports = {
    handler : function (callback, apiKeys, done, req, res) {
        var qs = require('querystring');
        var request = require('request');
        var url = require('url');
        var OAlib = require('oauth').OAuth;
        var OA = new OAlib('https://www.google.com/accounts/OAuthGetRequestToken'
         , 'https://www.google.com/accounts/OAuthGetAccessToken'
         , apiKeys.appKey
         , apiKeys.appSecret
         , '1.0'
         , callback
         , 'HMAC-SHA1'
         , null
         , {'Accept': '*/*', 'Connection': 'close'});
        var qs = url.parse(req.url, true).query;
        var serializer = require('serializer').createSecureSerializer(apiKeys.appSecret, apiKeys.appSecret);

        // second phase, post-user-authorization
        var sess;
        if(req.cookies && req.cookies["gmail_client"]) try { sess = serializer.parse(req.cookies["gmail_client"]) }catch(E){}
        if(qs && qs.oauth_token && sess && sess.token_secret)
        {
            OA.getOAuthAccessToken(qs.oauth_token, sess.token_secret, qs.oauth_verifier, function (error, oauth_token, oauth_token_secret, additionalParameters) {
              console.error(qs,sess,arguments);
                if (error || !oauth_token) return done(new Error("oauth failed to get access token"));
                done(null, {
                    consumerKey : apiKeys.appKey,
                    consumerSecret : apiKeys.appSecret,
                    token : oauth_token,
                    tokenSecret: oauth_token_secret
                });
            });
            return;
        }

        // first phase, initiate user authorization
        OA.getOAuthRequestToken( { oauth_callback: callback, scope: 'https://mail.google.com/ https://www.google.com/m8/feeds/' }, function (error, oauth_token, oauth_token_secret, oauth_authorize_url, additionalParameters) {
          console.error(arguments);
            if(error) return res.end("failed to get token: "+error);
            res.cookie('gmail_client', serializer.stringify({token_secret:oauth_token_secret}), { path: '/', httpOnly: false }); // stash the secret
            res.redirect('https://www.google.com/accounts/OAuthAuthorizeToken?oauth_token=' + oauth_token);
        });
    }
}
