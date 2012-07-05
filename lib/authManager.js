var path = require('path');
var fs = require('fs');
var querystring = require('querystring');
var request = require('request');
var async = require('async');
var sanitizer = require('sanitizer');
var urllib = require('url');
var util = require('util');
var lutil = require('lutil');

var lconfig = require('lconfig');
var logger = require('logger').logger("authManager");
var syncManager = require('syncManager.js');
var acl = require('acl');
var profileManager = require('profileManager');
var instruments = require("instruments");

var OAuth2Provider = require('./oauth2-provider').OAuth2Provider;
var myOAP = new OAuth2Provider(lconfig.authSecrets.crypt, lconfig.authSecrets.sign);

var apiKeys = require('apiKeys');
var host = lconfig.externalBase + '/';

// wrapper to watch auth errors
function authfail(req, service, res, E, app)
{
  instruments.increment("auth.error."+service).send();
  logger.warn('auth fail',service,E);
  logger.anubis(null,{act:'auth', app:app, type:'autherror', service:service, error:E});
  // respond directly if applied request
  if(res.applied_flag) return res.json(lutil.jsonErr(E), 500);
  // no choice but to barf to user if no callback!
  if(!req.cookies || !req.cookies.callback) return res.send(E, 500);
  var url = req.cookies.callback && urllib.parse(req.cookies.callback,true);
  if(!url || !url.query || !url.query.redirect_uri) return res.send(E, 500);
  var redirect_uri = url.query.redirect_uri;
  redirect_uri += (url.query.response_type == 'token') ? '#' : '?';
  redirect_uri += 'error='+encodeURIComponent(util.inspect(E));
  logger.warn('redirecting back to',redirect_uri);
  res.redirect(redirect_uri);
}

// and get the auth url for it to return
function startServiceAuth(service, appID, req, res) {
  logger.debug('starting service auth for '+service,appID);
  logger.anubis(req,{act:'auth', app:appID, type:'auth', service:service, stage:'start'});
  var authModule;
  try {
    authModule = require(path.join('services', service, 'auth.js'));
  } catch (E) {
    logger.warn("can't load auth.js for "+service,E);
    return authfail(req, service, res, "Unknown service: "+sanitizer.escape(service), appID);
  }

  // oauth2 types redirect
  if (authModule.authUrl) {
	logger.debug('starting oauth2');
    return apiKeys(service, appID, function(keys) {
      if (!keys) return authfail(req, service, res, 'missing required oauth2 api keys', appID);
      var suffix = (authModule.strict) ? '' : '/'+appID; // some are strict and have to fallback to cookie based
      var url;
      if (typeof authModule.authUrl === 'function') {
        url = urllib.parse(authModule.authUrl(req), true);
      } else {
        url = urllib.parse(authModule.authUrl, true);
      }
		
      delete url.search; // totally lame that this supercedes url.query!
      if(req.query.scope) url.query.scope = req.query.scope;
      url.query.client_id = keys.appKey;
      url.query.redirect_uri = lconfig.externalBase + '/auth/' + service + '/auth'+suffix;
      logger.debug('redirecting to '+urllib.format(url));
      return res.redirect(urllib.format(url));
    });
  }
  logger.debug('auth falling past oauth2');
  // everything else is pass-through (custom, oauth1, etc)
  exports.authIsAuth(service, appID, req, res);
}

// handle actual auth api requests or callbacks, much conflation to keep /auth/foo/auth consistent everywhere!
exports.authIsAuth = function(service, appID, req, res) {
  logger.verbose('processing auth for '+service,appID);
  logger.anubis(req,{act:'auth', app:appID, type:'auth', service:service, stage:'auth'});

  var authModule;
  try {
    authModule = require(path.join('services', service, 'auth.js'));
  } catch (E) {
    return authfail(req, service, res, E, appID);
  }

  // some custom code gets run for non-oauth2 options here, wear a tryondom
  if (typeof authModule.direct === 'function') {
    try {
      return authModule.direct(res);
    } catch (err) {
      return authfail(req, service, res, err, appID);
    }
  }

  var suffix = (authModule.strict) ? '' : '/'+appID; // some are strict and have to fallback to cookie based
  var redirectURI = lconfig.externalBase + '/auth/' + service + '/auth'+suffix;

  // now keys are required
  apiKeys(service, appID, function(keys){
    if (!keys) return authfail(req, service, res, 'missing required api keys', appID);

    if (typeof authModule.handler === 'function') {
      try {
        return authModule.handler(redirectURI, keys, function (err, auth) {
          if (err) return authfail(req, service, res, err, appID);
          finishAuth(req, res, service, auth, appID);
        }, req, res);
      } catch (E) {
        logger.error(E);
        return authfail(req, service, res, E, appID);
      }
    }

    var code = req.param('code');
    if (!code || !authModule.handler.oauth2) return authfail(req, service, res, 'missing auth code, doth deny us? :(', appID);
    finishOAuth2(code, redirectURI, authModule, keys, function (err, auth) {
      if (err) return authfail(req, service, res, err, appID);
      finishAuth(req, res, service, auth, appID);
    });

  });
};

function finishOAuth2(code, redirect, authModule, theseKeys, callback) {
  // oauth2 callbacks from here on out
  var method = authModule.handler.oauth2;
  var postData = {
    client_id: theseKeys.appKey,
    client_secret: theseKeys.appSecret,
    redirect_uri: redirect,
    grant_type: authModule.grantType,
    code: code
  };
  var req = {
    method: method,
    url: authModule.endPoint
  };
  if (method === 'POST') {
    req.body = querystring.stringify(postData);
    req.headers = {'Content-Type' : 'application/x-www-form-urlencoded'};
  } else {
    req.url += '/access_token?' + querystring.stringify(postData);
  }
  request(req, function (err, resp, body) {
    try {
      body = JSON.parse(body);
    } catch(err) {
      body = querystring.parse(body);
    }
    var auth = {
      accessToken: body.access_token, // legacy that there's two different patterns here
      token: body,
      clientID: theseKeys.appKey,
      clientSecret: theseKeys.appSecret
    };
    if (typeof authModule.authComplete !== 'function') return callback(undefined, auth);
    return authModule.authComplete(auth, callback);
  });
}

// handler for app applied auth directly
exports.authApply = function(service, req, res) {
  var appID = req.query.client_id;
  var auth = {};
  acl.getApp(appID, function(err, app){
    if(err) return res.json(lutil.jsonErr(err), 500);
    if(!app) return res.json(lutil.jsonErr('no such app'), 404);
    if(app.secret != req.query.client_secret) return res.json(lutil.jsonErr('validation failed'), 401);
    if(!app.apikeys || !app.apikeys[service]) return res.json(lutil.jsonErr('missing production service keys'), 404);
    var keys = app.apikeys[service];
    var auth = {
      applied: Date.now(),
      clientID: keys.appKey,
      clientSecret: keys.appSecret
    };
    // there's different formats between oauth1 and 2 meh :/
    if(req.query.token_secret)
    {
      // oauth1 services expect these names instead
      auth.consumerKey = keys.appKey;
      auth.consumerSecret = keys.appSecret;
      // these two are oddballs in how they did their oauth1 token storage
      if(service == 'tumblr' || service == 'twitter')
      {
        auth.token = { oauth_token: req.query.token, oauth_token_secret: req.query.token_secret };
      }else{
        auth.token = req.query.token;
        auth.tokenSecret = req.query.token_secret;
      }
    }else{
      auth.token = req.query; // stash all variables in case there were per-service ones as allowed in oauth2
      auth.token.access_token = req.query.token; // properly named
      // also needs to be refactored someday, lame difference
      if(service == 'facebook' || service == 'foursquare' || service == 'github') auth.accessToken = req.query.token;      
    }
    if(req.query.scope) auth.scope = req.query.scope;
    if(req.query.account) auth.account = req.query.account;
    res.applied_flag = true; // signals to respond directly w/ all results
    finishAuth(req, res, service, auth, appID);
  });
}

// save out auth and kick-start synclets, plus respond
function finishAuth(req, res, service, auth, appID) {
  var redir = req.cookies && req.cookies.callback;
  if(!res.applied_flag)
  {
    // we can only succeed if we know where to redirect back to now
    if(!redir) return authfail(req, service, res, 'cookies disabled? missing redirect :(', appID, req.cookies);
    redir = urllib.parse(lconfig.externalBase + redir, true);
    if(redir.query.scope) auth.scope = redir.query.scope; // nice to remember what was requested
    if(redir.query.account) auth.account = redir.query.account; // force to specific account    
  }
  logger.debug("FA ",service,auth,redir,res.applied_flag);
  logger.anubis(req,{act:'auth', app:appID, type:'auth', service:service, stage:'finish'});
  var self;
  try {
    self = require(path.join('services', service, 'self.js'));
  } catch (E) {
    return authfail(req, service, res, E, appID);
  }
  self.sync({auth:auth, config:{}}, function(err, data){
    if(!err && (!data || !data.auth)) err = "no error or auth returned";
    if(err) logger.warn(err);
    if(err) return authfail(req, service, res, err, appID);
    auth = data.auth; // has .profile now yay!
    logger.info('authorized '+auth.pid);
    // if there's an existing account, fetch/use that id, otherwise an undefined will create one
    var acookie = getACookie(req, appID);
    if(auth.account) acookie.id = auth.account;
    acl.getOrAdd(acookie.id, appID, auth.pid, function(err, account, count) {
      if (err) logger.error("failed to get|add ",err);
      if (err) return authfail(req, service, res, err, appID);
      if (!account) return authfail(req, service, res, 'could not create a user', appID);
      if (count > 1) logger.warn("multiple accounts for a profile!",appID,auth.pid); // TODO if no acookie.id enforce no logins on multi-accounts?
      async.series([
        function(cb) {
          profileManager.authSet(auth.pid, auth, appID, cb);
        },
        function() {
          instruments.increment("auth.successful."+service).send();
          syncManager.initService(service, auth, function () {}); // save auth, set up synclet tasks, and forces immediate sync too
          if(res.applied_flag) return res.json(account);
          // set/update the account-level sticky cookie for subsequent auths
          acookie.id = account.account;
          setACookie(res, acookie);
          redir.query.authed = account.account;
          delete redir.search;
          logger.debug('redirecting back into oauth',urllib.format(redir));
          return res.redirect(urllib.format(redir));
        }
      ]);
    });
  });
}

// utils to get/set or init the sticky account cookie, using the same crypto keys as oauth
function getACookie(req, app)
{
  var account = {app:app};
  if(req.cookies && req.cookies["account-"+app])
  {
    try {
      account = myOAP.serializer.parse(req.cookies["account-"+app]);
    }catch(E){}
  }
  logger.debug("ACOOKIE get "+JSON.stringify(account));
  return account;
}
function setACookie(res, account)
{
  logger.debug("ACOOKIE set "+JSON.stringify(account));
  var expirey = Date.now() + (lconfig.cookieExpire * 1000);
  var opaque = myOAP.serializer.stringify(account);
  res.cookie('account-'+account.app, opaque, { path: '/', httpOnly: false });
// disabling sticky, session only for now to be easier to dev
//  res.cookie('account-'+account.app, opaque, { path: '/', expires: new Date(expirey), httpOnly: false });
}

// before showing authorization page, make sure the user is logged in
myOAP.on('enforce_login', function(req, res, authorize_url, cbForm) {
  if (!req.query.service) return res.send('missing service', 400);
  if (!req.query.client_id) return res.send('missing client_id', 400);
  // first, verify client_id is an app we know about
  logger.debug("enforce login "+req.url);
  acl.getApp(req.query.client_id, function(err, app){
    if (err || !app || app.length === 0) {
      logger.error("login, failed to find "+req.query.client_id,err);
      return res.send('invalid client_id', 400);
    }
    logger.debug("got app ",app);

    // verify redirect_uri here is superset of the configured one
    if (!app.notes              ||
        !app.notes.callbackUrl  ||
        !req.query.redirect_uri ||
        req.query.redirect_uri.indexOf(app.notes.callbackUrl) !== 0) {
      logger.warn("callback mismatch warning!", app.app, app.notes && app.notes.callbackUrl, req.query.redirect_uri);
      logger.anubis(req,{act:'auth', app:app.app, type:'autherror', service:req.query.service, error:'callback mismatch'});

      /* return res.send(
        "Unacceptable redirect_uri. If you are the developer, please check " +
        "<pre>" + sanitizer.escape(req.query.redirect_uri) + "</pre>" +
        " against your " +
        "<a href=\"https://dev.singly.com/apps\">application settings</a>."
      ); */
    }

    // if starting auth
    function auther(){
      // need a couple things stored on the session for post-auth
      logger.debug("starting auth for ",req.url);
      res.cookie('callback', req.url, { path: '/', httpOnly: false });
      // fallback stash the app id on the browser, some stupid oauth's don't support callback (tumblr!)
      res.cookie('auth'+req.query.service, app.app, { path: '/', httpOnly: false });
      return startServiceAuth(req.query.service, app.app, req, res);
    }

//    var account = getACookie(req, app.app);
    var account = req.query.authed;
    if(!account) return auther();
    acl.getProfiles(account, function(err, profiles) {
      if(err) logger.error('error getting profile' + JSON.stringify(err), account);
      if(!profiles) return auther();
      var found = false;
      profiles.forEach(function(item){
        logger.debug("AUTH CHECK "+item.profile);
        if(item.profile.indexOf(req.query.service) > 0) found = true;
      });
      // magic, service was authorized so flow auth back to the app!
      if(found) {
        logger.anubis(req,{act:'auth', app:app.app, type:'auth', service:req.query.service, stage:'success'});
        return cbForm(account);
      }
      // start new auth this service wasn't found
      auther();
    });
  });
});

// render the authorize form with the submission URL
// right now we're just skipping this step
myOAP.on('authorize_form', function(req, res, client_id, authorize_url) {
//  res.end('<html>this app wants to access your account... <form method="post" action="' + authorize_url + '"><button name="allow">Allow</button><button name="deny">Deny</button></form><script>document.forms[0]["allow"].click()</script>');
  logger.debug('auto-submitting auth form',authorize_url);
  res.end('<html><form method="post" action="' + authorize_url + '"><input name="allow" value="true" hidden="true"></form><script>document.forms[0].submit()</script>');
});

// save the generated grant code for the current user
myOAP.on('save_grant', function(req, client_id, code, callback) {
  logger.debug("grant saving",code,req.query.authed, client_id)
  acl.addGrant(code, req.query.authed, client_id, function(err){
    if(err) logger.error("save grant failed",err);
    callback();
  });
});

// remove the grant when the access token has been sent
myOAP.on('remove_grant', function(account, client_id, code) {
  acl.delGrant(code, function(err){
    if(err) logger.error("del grant failed",err);
  });
});

// find the user for a particular grant
myOAP.on('lookup_grant', function(client_id, client_secret, code, cb) {
  // verify that client id/secret pair are valid
  function callback(err, user) {
    logger.debug("returning ",err,user);
    logger.anubis(null,{act:'auth', app:client_id, type:'auth', stage:'granted', user:user, error:err});
    cb(err, user);
  }
  logger.debug("LOOKUPGRANT "+client_id+":"+code);
  acl.getApp(client_id, function(err, app){
    if(err) return callback(err);
    if(!app) return callback(new Error('no such app'));
    if(app.secret != client_secret) return callback(new Error('app mismatch'));
    acl.getGrant(code, function(err, grant){
      if(err) return callback(err);
      logger.debug(grant, typeof client_id);
      if(!grant || !grant.account) return callback(new Error('invalid grant'));
      if(grant.app != client_id) return callback(new Error('app grant mismatch'));
      callback(undefined, grant.account);
    });
  });
});

// we can optionally add data to the token, but we don't need to yet
myOAP.on('create_access_token', function(account_id, client_id, callback) {
  logger.debug("CREATING ACCESS TOKEN "+account_id+" "+client_id);
  callback(null);
});

// a verified valid access token was received in a URL query string parameter or HTTP header, set our own flags on the request
myOAP.on('access_token', function(req, token, next) {
  // warn after 10 days
  var TOKEN_TTL = 10 * 24 * 60 * 60 * 1000;
  if(token.grant_date.getTime() + TOKEN_TTL < Date.now())
    logger.warn('access token for account %s is old', token.user_id);

  // for all api requests, they're legit now
  var authsome = {account:token.user_id, app:token.client_id};

  acl.getProfiles(authsome.account, function(err, profiles) {
    if(err || !profiles || profiles.length == 0) logger.warn('error getting profile',err,profiles);
    else {
      authsome.profiles = profiles;
//      authsome.profiles.push({profile:authsome.account+'@'+authsome.app}); confusing, temp disabled, see https://github.com/Singly/hallway/issues/258
      req._authsome = authsome;
    }
    next();
  });
});

exports.provider = myOAP;

function escape_entities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
