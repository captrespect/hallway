var OAuth2Provider = require('oauth2-provider').OAuth2Provider;
console.error('DEBUG: OAuth2Provider');
// hardcoded list of <client id, client secret> tuples
var myClients = {
 '1': '1secret',
};

// temporary grant storage
var myGrants = {};

var myOAP = new OAuth2Provider('encryption secret', 'signing secret');

// before showing authorization page, make sure the user is logged in
myOAP.on('enforce_login', function(req, res, authorize_url, next) {
  console.error("DEBUG: enforce_login query", req.query);
  var service = req.query.service;
  if(service) {
    return res.redirect('/auth/' + service);
  } else {
    return res.send('bad service', 400);
  }

  // if(req.session.user) {
  //   req.session.user = 'abcdef';
  //   next(req.session.user);
  // } else {
  //   res.writeHead(303, {Location: '/login?next=' + encodeURIComponent(authorize_url)});
  //   res.end();
  // }
});

// render the authorize form with the submission URL
// use two submit buttons named "allow" and "deny" for the user's choice
myOAP.on('authorize_form', function(req, res, client_id, authorize_url) {
  res.end('<html>this app wants to access your account... <form method="post" action="' + authorize_url + '"><button name="allow">Allow</button><button name="deny">Deny</button></form>');
});

// save the generated grant code for the current user
myOAP.on('save_grant', function(req, client_id, code, next) {
  if(!(req.session.user in myGrants))
    myGrants[req.session.user] = {};

  myGrants[req.session.user][client_id] = code;
  next();
});

// remove the grant when the access token has been sent
myOAP.on('remove_grant', function(user_id, client_id, code) {
  if(myGrants[user_id] && myGrants[user_id][client_id])
    delete myGrants[user_id][client_id];
});

// find the user for a particular grant
myOAP.on('lookup_grant', function(client_id, client_secret, code, next) {
  console.error('DEBUG: lookup grant');
  // verify that client id/secret pair are valid
  if(client_id in myClients && myClients[client_id] == client_secret) {
    for(var user in myGrants) {
      var clients = myGrants[user];

      if(clients[client_id] && clients[client_id] == code)
        return next(null, user);
    }
  }

  next(new Error('no such grant found'));
});

// embed an opaque value in the generated access token
myOAP.on('create_access_token', function(user_id, client_id, next) {
  var data = 'blah'; // can be any data type or null

  next(data);
});

// an access token was received in a URL query string parameter or HTTP header
myOAP.on('access_token', function(req, token, next) {

  var TOKEN_TTL = 10 * 60 * 1000; // 10 minutes

  if(token.grant_date.getTime() + TOKEN_TTL > Date.now()) {
    req.session.user = token.user_id;
    req.session.data = token.extra_data;
  } else {
    console.warn('access token for user %s has expired', token.user_id);
  }

  next();
});

module.exports = myOAP;

function escape_entities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}