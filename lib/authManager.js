var path = require('path');
var fs = require('fs');
var querystring = require('querystring');
var request = require('request');
var async = require('async');

var lconfig = require('lconfig');
var logger = require('logger').logger("authManager");
var syncManager = require('syncManager.js');
var acl = require('acl');
var profileManager = require('profileManager');

var OAuth2Provider = require('oauth2-provider').OAuth2Provider;
var myOAP = new OAuth2Provider(lconfig.authSecrets.crypt, lconfig.authSecrets.sign);

// simple in-memory grant storage, data is only transient during the oauth2 exchange
var myGrants = {};

var apiKeys = require('apiKeys');
var host = lconfig.externalBase + '/';

// and get the auth url for it to return
function startServiceAuth(service, req, res) {
  console.error('starting service auth for '+service);
  var authModule;
  try {
    authModule = require(path.join('services', service, 'auth.js'));
  } catch (E) {
    logger.error("can't load auth.js for "+service,E);
    return res.send(E, 500);
  }
  // oauth2 types redirect
  if (authModule.authUrl) return startOAuth2(service, authModule, req, res);

  // everything else is pass-through (custom, oauth1, etc)
  exports.authIsAuth(service, req, res);
}

function startOAuth2(service, authModule, req, res) {
  if (!apiKeys[service]) return res.send('missing required api keys', 500);
  var url = authModule.authUrl + '&client_id=' + apiKeys[service].appKey + '&redirect_uri=' + lconfig.externalBase + '/auth/' + service + '/auth';
  return res.redirect(url);
}

// handle actual auth api requests or callbacks, much conflation to keep /auth/foo/auth consistent everywhere!
exports.authIsAuth = function(service, req, res, onComplete) {
  logger.verbose('processing auth for '+service);

  var authModule;
  try {
    authModule = require(path.join('services', service, 'auth.js'));
  } catch (E) {
    return res.send(E, 500);
  }

  // some custom code gets run for non-oauth2 options here, wear a tryondom
  if (typeof authModule.direct === 'function') {
    try {
      return authModule.direct(res);
    } catch (err) {
      return res.send(err, 500);
    }
  }

  // rest require apikeys
  if (!apiKeys[service]) return res.send('missing required api keys', 500);

  if (typeof authModule.handler === 'function') {
    try {
      return authModule.handler(host, apiKeys[service], function (err, auth) {
        if (err) return res.send(err, 500);
        finishAuth(req, res, service, auth);
      }, req, res);
    } catch (E) {
      return res.send(E, 500);
    }
  }

  var code = req.param('code');
  if (!code || !authModule.handler.oauth2) return res.send('very bad request', 500);
  finishOAuth2(code, service, authModule, function (err, auth) {
    if (err) return res.send(err, 500);
    finishAuth(req, res, service, auth);
  });
}

function finishOAuth2(code, service, authModule, callback) {
  // oauth2 callbacks from here on out

  var theseKeys = apiKeys[service];

  var method = authModule.handler.oauth2;
  var postData = {
    client_id: theseKeys.appKey,
    client_secret: theseKeys.appSecret,
    redirect_uri: host + 'auth/' + service + '/auth',
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
    var auth = {accessToken: body.access_token};
    if (method === 'POST') {
      auth = {
        token: body,
        clientID: theseKeys.appKey,
        clientSecret: theseKeys.appSecret
      };
    }
    if (typeof authModule.authComplete !== 'function') return callback(undefined, auth);
    return authModule.authComplete(auth, callback);
  });
}

// save out auth and kick-start synclets, plus respond
function finishAuth(req, res, service, auth) {
  console.error("FA ",service,auth);
  try {
    var self = require(path.join('services', service, 'self.js'));
  } catch (E) {
    logger.error(E);
    return res.send(E, 500);
  }
  self.sync({auth:auth}, function(err, data){
    if(err) logger.error(err);
    if(err) return res.send(err, 500);
    auth = data.auth; // has .profile now yay!
    logger.info('authorized '+auth.pid);
    // if there's an existing account, fetch/use that id, otherwise an undefined will create one
    var acookie = getACookie(req, req.session.app);
    acl.getOrAdd(acookie.id, req.session.app, auth.pid, function(err, account) {
      if (err) logger.error("failed to get|add ",err);
      if (err) return res.send(err, 500);
      if (!account) return res.send('could not create a user', 500);
      async.series([
        function(cb) { profileManager.workerSet(auth.pid, lconfig.workerName, cb)},
        function(cb) { profileManager.authSet(auth.pid, auth, cb)},
        function() {
          syncManager.initService(service, auth, function () {}); // save auth, set up synclet tasks, and forces immediate sync too
          // set/update the account-level sticky cookie for returns and service adds, to short-circuit later
          acookie.id = account.account;
          acookie.services[service]=true;
          setACookie(res, acookie);
          return res.redirect(req.session.loggedInUrl);          
        }
      ]);
    });
  });
}

// utils to get/set or init the sticky account cookie, using the same crypto keys as oauth
function getACookie(req, app)
{
  var account = {app:app, services:{}};
  if(req.cookies && req.cookies["account-"+app])
  {
    try {
      account = myOAP.serializer.parse(req.cookies["account-"+app]);
    }catch(E){}
  }
  console.error("ACOOKIE get "+JSON.stringify(account));
  return account;
}
function setACookie(res, account)
{
  console.error("ACOOKIE set "+JSON.stringify(account));
  var expirey = Date.now() + (lconfig.cookieExpire * 1000);
  var opaque = myOAP.serializer.stringify(account);
  res.cookie('account-'+account.app, opaque, { path: '/', httpOnly: false });
// disabling sticky, session only for now to be easier to dev
//  res.cookie('account-'+account.app, opaque, { path: '/', expires: new Date(expirey), httpOnly: false });
}

// before showing authorization page, make sure the user is logged in
myOAP.on('enforce_login', function(req, res, authorize_url, cbForm) {
//console.error("ENFORCE "+req.url+" "+JSON.stringify(req.session)+" "+JSON.stringify(req.query));
  if (!req.query.service) return res.send('missing service', 400);
  if (!req.query.client_id) return res.send('missing client_id', 400);
  // first, verify client_id is an app we know about
  console.error("enforce login "+req.url);
  acl.getApp(req.query.client_id, function(err, app){
    if(err || !app || app.length == 0) console.error("login, failed to find "+req.query.client_id,err);
    if(err || !app || app.length == 0) return res.send('invalid client_id', 400);
    console.error("got app ",app);
    // TODO, verify redirect_uri here

    // if starting auth
    function auther(){
      // need a couple things stored on the session for post-auth
      req.session.app = req.query.client_id;
      req.session.loggedInUrl = req.url;
      return startServiceAuth(req.query.service, req, res);      
    };

    var account = getACookie(req, app.app);
    if(!account.id) return auther();
    acl.getProfiles(account.id, function(err, profiles) {
      if(err) logger.error('error getting profile' + JSON.stringify(err), account);
      if(!profiles) return auther();
      var found = false;
      profiles.forEach(function(item){
        console.error("AUTH CHECK "+item.profile);
        if(item.profile.indexOf(req.query.service) > 0) found = true;
      });
      // magic, service was authorized so flow auth back to the app!
      found ? cbForm(account.id) : auther();
    });
  });
});

// render the authorize form with the submission URL
// right now we're just skipping this step
myOAP.on('authorize_form', function(req, res, client_id, authorize_url) {
//  console.error("AUTHFORM "+JSON.stringify(req.session));
//  res.end('<html>this app wants to access your account... <form method="post" action="' + authorize_url + '"><button name="allow">Allow</button><button name="deny">Deny</button></form><script>document.forms[0]["allow"].click()</script>');
  res.end('<html><form method="post" action="' + authorize_url + '"><input name="allow" value="true" hidden="true"></form><script>document.forms[0].submit()</script>');
});

// save the generated grant code for the current user
myOAP.on('save_grant', function(req, client_id, code, callback) {
//  console.error("SAVEGRANT "+JSON.stringify(req.session));
  var account = getACookie(req, client_id);
  if(!(account.id in myGrants))
    myGrants[account.id] = {};

  myGrants[account.id][client_id] = code;
  callback();
});

// remove the grant when the access token has been sent
myOAP.on('remove_grant', function(account, client_id, code) {
//  console.error("REMOVEGRANT "+account+":"+client_id+":"+code);
  if(myGrants[account] && myGrants[account][client_id])
    delete myGrants[account][client_id];
});

// find the user for a particular grant
myOAP.on('lookup_grant', function(client_id, client_secret, code, cb) {
  // verify that client id/secret pair are valid
  function callback(err, user) {
    console.error("returning ",err,user);
    cb(err, user);
  }
  console.error("LOOKUPGRANT "+client_id+":"+code);
  acl.getApp(client_id, function(err, app){
    if(err) return callback(err);
    if(!app) return callback(new Error('no such app'));
    if(app.secret != client_secret) return callback(new Error('app mismatch'));
    for(var user in myGrants) {
      var clients = myGrants[user];
      if(clients[client_id] && clients[client_id] == code)
        return callback(undefined, user);
    }
  });
});

// we can optionally add data to the token, but we don't need to yet
myOAP.on('create_access_token', function(account_id, client_id, callback) {
  console.error("CREATING ACCESS TOKEN "+account_id+" "+client_id);
  callback(null);
});

// a verified valid access token was received in a URL query string parameter or HTTP header, set our own flags on the request
myOAP.on('access_token', function(req, token, next) {
  // warn after 10 days
  var TOKEN_TTL = 10 * 24 * 60 * 60 * 1000;
  if(token.grant_date.getTime() + TOKEN_TTL < Date.now())
    console.warn('access token for account %s is old', token.user_id);

  // for all api requests, they're legit now
  req._authsome = {account:token.user_id, app:token.client_id};

  acl.getProfiles(req._authsome.account, function(err, profiles) {
    if(err) logger.error('error getting profile' + JSON.stringify(err));
    else req._authsome.profiles = profiles;
    next();
  });
});

exports.provider = myOAP;

function escape_entities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
