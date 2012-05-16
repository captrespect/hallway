module.exports = {
  handler : function (callback, apiKeys, done, req, res) {
    var lib = require('./lib');
    var url = require('url');
    var qs = url.parse(req.url, true).query;
    
    // post auth callback
    if(qs && qs.contextio_token) {
      lib.fetch(apiKeys, 'connect_tokens/'+qs.contextio_token, function(err, js){
        if(err) return done(err);
        if(!js || !js.account || !js.account.id) return done(new Error("response was missing account"));
        done(null, {
            appKey : apiKeys.appKey,
            appSecret : apiKeys.appSecret,
            account : js.account.id
        });
      });
      return;
    }
    
    // first time auth flow init
    lib.fetch(apiKeys, 'connect_tokens', function(err, js){
      if(err) return done(err);
      if(!js || !js.browser_redirect_url) return done(new Error("missing generated redir url"));
      res.redirect(js.browser_redirect_url);
    }, {callback_url:callback});
  }
}
