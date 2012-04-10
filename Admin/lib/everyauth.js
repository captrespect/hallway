module.exports = function(db) {
    var everyauth = require('everyauth')
      , auth = require('./auth')
//      , accounts = db.getCollection('accounts')
//      , sessions = db.getCollection('sessions')
      , config = require('./config')
      , users = require('../controllers/users')
      ;

    // uncomment this for awesome debugging info
    //
    // everyauth.debug = true;
    everyauth.everymodule.handleLogout(function(req, res) {
      req.logout(); // The logout method is added for you by everyauth, too
      req.session.destroy();
      // Do any other logout cleanup here
      res.writeHead(303, { 'Location': this.logoutRedirectPath() });
      res.end();
    });

    everyauth.everymodule.findUserById( function(userId, callback) {
      accounts.findOne({'_id' : new db.ObjectID(userId)}, callback);
    });

    everyauth.everymodule.moduleTimeout(60000);

    everyauth.password
      .validateRegistration(users.validateRegistration)
      .getLoginPath('/login') // Uri path to the login page
      .postLoginPath('/login') // Uri path that your login form POSTs to
      .loginView('login.ejs')
      .loginLayout('layouts/integral.ejs')
      .loginLocals(function(req, res) {
        return {
          hideHeader: true
        };
      })
      .authenticate(function(login, password) {
          return auth.validateLogin(login, password, this.Promise());
      })
      .loginSuccessRedirect('/') // Where to redirect to after a login
      .getRegisterPath('/register') // Uri path to the registration page
      .postRegisterPath('/register') // The Uri path that your registration form POSTs to
      .registerView('register.ejs')
      .registerLayout('layouts/integral.ejs')
      .registerLocals(function(req, res) {
        return {
          hideHeader: true
        , inviteCode: req.param('inviteCode')
        };
      })
      .registerUser(function(newUserAttributes) {
          return auth.createAccount(newUserAttributes, this.Promise());
      })
      .loginWith('email')
      .registerSuccessRedirect('/') // Where to redirect to after a successful registration
      .extractExtraRegistrationParams(function(req) {
          return {
              name: req.body.name
            , inviteCode: req.body.inviteCode
            , tempInviteCode: req.session.tempInviteCode
            , githubCode: req.session.githubCode
            , optin: (req.body.optin || false)
          };
      });

    return everyauth;
};
