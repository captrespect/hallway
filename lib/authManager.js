var path = require('path');
var fs = require('fs');
var querystring = require('querystring');

var OAuth2Provider = require('oauth2-provider').OAuth2Provider;

var lconfig = require('lconfig');
var logger = require('logger');
var syncManager = require('syncManager.js');
var accountsManager = require('accountsManager');
// var tokenManager = require('tokenManager');

var apiKeys = JSON.parse(fs.readFileSync(lconfig.apikeysPath, 'utf-8'));
var host = lconfig.externalBase + '/';

// and get the auth url for it to return
function startServiceAuth(service, req, res) {
  var authModule;
  try {
    authModule = require(path.join(lconfig.lockerDir, 'Connectors', service, 'auth.js'));
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
    authModule = require(path.join(lconfig.lockerDir, 'Connectors', service, 'auth.js'));
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
  try {
    var self = require(path.join(lconfig.lockerDir, 'Connectors', service, 'self.js'));
  } catch (E) {
    logger.error(E);
    return res.send(E, 500);
  }
  self.sync({auth:auth}, function(err, data){
    if(err) logger.error(err);
    if(err) return res.send(err, 500);
    auth = data.auth; // has .profile now yay!
    logger.info('authorized '+auth.pid);
    accountsManager.authToApp(auth.pid, auth, function(err, account) {
      if (err) return res.send(err, 500);
      if (!account) return res.send('could not create a user', 500);
      process.nextTick(function() {
        syncManager.syncNow(service, auth, function () {}); // force immediate sync too
      });
      // temp! account gen including service
      req.session.account_id = account.account_id+auth.pid;
      return res.redirect(req.session.loggedInUrl);
    });
  });
}

// hardcoded list of <client id, client secret> tuples
var myClients = {
 '1': '1secret',
};

// temporary grant storage
var myGrants = {};

var myOAP = new OAuth2Provider('encryption secret', 'signing secret');

// before showing authorization page, make sure the user is logged in
myOAP.on('enforce_login', function(req, res, authorize_url, next) {
console.error("ENFORCE "+req.url+" "+JSON.stringify(req.session)+" "+JSON.stringify(req.query));
  if (!req.query.service) return res.send('missing service', 400);
  if (!req.query.client_id) return res.send('missing client_id', 400);
  if (req.session.account_id) return next(req.session.account_id);
  req.session.client_id = req.query.client_id;
  req.session.loggedInUrl = req.url;
  return startServiceAuth(req.query.service, req, res);
});

// render the authorize form with the submission URL
// use two submit buttons named "allow" and "deny" for the user's choice
myOAP.on('authorize_form', function(req, res, client_id, authorize_url) {
  console.error("AUTHFORM "+JSON.stringify(req.session));
  res.end('<html>this app wants to access your account... <form method="post" action="' + authorize_url + '"><button name="allow">Allow</button><button name="deny">Deny</button></form>');
});

// save the generated grant code for the current user
myOAP.on('save_grant', function(req, client_id, code, next) {
  console.error("SAVEGRANT "+JSON.stringify(req.session));
  if(!(req.session.account_id in myGrants))
    myGrants[req.session.account_id] = {};

  myGrants[req.session.account_id][client_id] = code;
  next();
});

// remove the grant when the access token has been sent
myOAP.on('remove_grant', function(account_id, client_id, code) {
  console.error("REMOVEGRANT "+account_id+":"+client_id+":"+code);
  if(myGrants[account_id] && myGrants[account_id][client_id])
    delete myGrants[account_id][client_id];
});

// find the user for a particular grant
myOAP.on('lookup_grant', function(client_id, client_secret, code, next) {
  // verify that client id/secret pair are valid
  console.error("LOOKUPGRANT "+client_id+":"+code);
  if(client_id in myClients && myClients[client_id] == client_secret) {
    for(var user in myGrants) {
      var clients = myGrants[user];

      if(clients[client_id] && clients[client_id] == code)
        return next(undefined, user);
    }
  }

  next(new Error('no such grant found'));
});

// embed an opaque value in the generated access token
myOAP.on('create_access_token', function(account_id, client_id, next) {
  var data = 'blah'; // can be any data type or null
  // tokenManager.saveToken(account_id, client_id, data, function(err) {
    next(data);
  // });
});

// an access token was received in a URL query string parameter or HTTP header
myOAP.on('access_token', function(req, token, next) {
  console.error("ACCESSTOKEN "+JSON.stringify(req.session));

  var TOKEN_TTL = 10 * 60 * 1000; // 10 minutes
  console.log(token);

  if(token.grant_date.getTime() + TOKEN_TTL > Date.now()) {
    req.awesome = {account:token.user_id, data:token.extra_data};
  } else {
    console.warn('access token for user %s has expired', token.user_id);
  }

  next();
});

exports.provider = myOAP;

function escape_entities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
