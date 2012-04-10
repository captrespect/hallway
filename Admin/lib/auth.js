var crypto = require('crypto')
  //, config = require('../lib/config')
  // integral dependency
  //, mailer = require('mailer')
  // only used for mailer
  //, _ = require('./merger')
  // only used for random number
  //, utils = require('./utils')
//  , invites = require('../models/invites')
  , request = require("request")
  //, winston = require("../lib/logger")
//  , accounts
//  , sessions
  ;

/*
db.connect(function() {
    accounts = db.getCollection('accounts');
    sessions = db.getCollection('sessions');
});
*/

exports.validateLogin = function(email, password, promise) {
    email = email.toLowerCase();
    accounts.findOne({email:email}, function(err, account) {
        if(err) {
            promise.fulfill(['There was an error logging you in']);
        } else {
            if(exports.checkPassword(account, password)) {
                account.id = account._id;
                promise.fulfill(account);
            } else {
                promise.fulfill(['Unknown email or incorrect password']);
            }
        }
    });
    return promise;
};

exports.createAccount = function (newUserAttributes, promise) {
    invites.isValid(newUserAttributes.inviteCode, function (err, resp) {
        if ((newUserAttributes.tempInviteCode !== newUserAttributes.inviteCode) && (err || !resp.success)) {
            promise.fulfill([resp.errors]);
            return promise;
        }

        var user       = hashPassword(newUserAttributes.password)
          , email      = newUserAttributes.email.toLowerCase()
          , lockerName = utils.generateLockerName(newUserAttributes.email.toLowerCase())
          , name       = newUserAttributes.name
          , optin      = newUserAttributes.optin ? "true" : "false"
          ;

        user.email      = email;
        user.name       = name;
        user.optin      = optin;
        user.locker     = {name : lockerName};
        user.emailToken = utils.random();
        user.createdAt  = Date.now();

        accounts.findOne({$or:[{email:email}, {'locker.name':lockerName}]}, function (err, doc) {
            if (err) {
                winston.error("error looking up account prior to creation: " + err);
                promise.fulfill(['account creation error']);
                return promise;
            }

            if (!doc) {
                winston.info('account, email: ' + email + ' lockerName: ' + lockerName);
                locker.createLocker(user, function (err, doc) {
                    if (err) {
                        winston.error('locker creation error: ' + err);
                        promise.fulfill(['account creation error']);
                        return promise;
                    }

                    winston.info("locker " + doc.locker.name + " successfully created.");
                    if (newUserAttributes.githubCode) {
                        request.get({url:("http://" +
                                          doc.locker.host + ":" +
                                          doc.locker.port + "/auth/github/auth?code=" +
                                          newUserAttributes.githubCode)});
                    }

                    if (!newUserAttributes.tempInviteCode) invites.use(newUserAttributes.inviteCode, doc._id, function () {});

                    doc.id = doc._id;
                    exports.sendVerificationEmail(doc);
                    promise.fulfill(doc);
                });
            }
            else {
              promise.fulfill(
                ['That account already exists.<br /> Did you mean to sign in?']
              );
            }
        });
    });
    return promise;
};

exports.changePassword = function (_id, oldPassword, newPassword, cb) {
    if (newPassword === "") return cb({success:false, errors:['new password is invalid']});

    accounts.findOne(_id, function (err, account) {
        if (err || !account || !exports.checkPassword(account, oldPassword)) {
            return cb({success:false, errors:['account doesn\'t exist or old password is invalid']});
        }

        return exports.setPassword(_id, newPassword, cb);
    });
};

exports.setPassword = function(_id, newPass, cb) {
    var saltNHash = hashPassword(newPass);
    accounts.findAndModify({_id:_id},
                           [['_id', 'asc']],
                           {$set:{'hash':saltNHash.hash, 'salt':saltNHash.salt}, $unset: {'token': 1}},
                           function (err, doc) {
                               if (err || !doc) return cb({success:false, err:['could not update password: ' + err]});

                               if (_id) {
                                   winston.info("Removing sessions for " + _id);
                                   sessions.remove({session: {$regex: "userid.*" + _id}}, function (err, doc) {
                                       return cb({success:true});
                                   });
                               } else {
                                   cb({success:true});
                               }
                           });
};


var hashPassword = exports.hashPassword = function (password, salt) {
    var obj = {};
    obj.salt = salt || utils.random().substring(0, 4);
    obj.hash = hash(obj.salt + password);
    return obj;
};

function hash(str) {
    var hasher = crypto.createHash('sha1');
    hasher.update(str);
    return hasher.digest('hex');
}

exports.checkPassword = function (account, password) {
    if (!(account && account.salt && account.hash)) return false;

    var hashedPass = hashPassword(password, account.salt);
    return (hashedPass && hashedPass.hash && hashedPass.hash === account.hash);
};

exports.sendVerificationEmail = function (account) {
  var emailInfo = _.clone(config.mail);
  emailInfo.to = account.email;
  emailInfo.from = '"Singly" <noreply@singly.com>';
  emailInfo.subject = "Singly - Verify your email";
  emailInfo.template = __dirname + '/../../views/emails/verify-email.html';
  emailInfo.data = {
    firstName : account.name.split(' ')[0],
    verificationUrl : config.externalUrl + '/users/verifyEmail?' +
      'token=' + account.emailToken + '&email=' + account.email
  };
  mailer.send(emailInfo, function(err, result) {
    if (err) winston.error("Failed to send verification email - " + err);
    else winston.info('sent verification email to ' + account.email);
  });
};
