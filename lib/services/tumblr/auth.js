module.exports = {
    handler : function (cbURI, apiKeys, done, req, res) {
      console.error(cbURI);
        require('./tumblr_client')(apiKeys.appKey, apiKeys.appSecret, cbURI)
        .getAccessToken(req, res, function(err, newToken) {
            if(err) return done(err);
            if(!newToken) return done(new Error("token missing"));
            done(null, {
                consumerKey : apiKeys.appKey,
                consumerSecret : apiKeys.appSecret,
                token : newToken
            });
        });
    }
}