var express = require('express');
var connect = require('connect');
var logger = require('logger').logger("dawg");
var async = require('async');
var crypto = require('crypto');
var urllib = require('url');
var authManager = require('authManager');
var syncManager = require('syncManager');
var profileManager = require('profileManager');
var ijod = require('ijod');
var pipeline = require('pipeline');
var dMap = require('dMap');
var acl = require('acl');
var idr = require('idr');
var instruments = require("instruments");
var lconfig = require('lconfig');

var airbrake;

function authorize(user, pass) {
  if(!lconfig.dawg || lconfig.dawg.password) return false;
  return 'dawg' === user & 'password' === lconfig.dawg.password;
}

var dawg = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    logger.debug("REQUEST %s", req.url);
    return next();
  },
  express.basicAuth(authorize),
  // enable CORS
  function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  }
);

dawg.use(express.static(__dirname + '/../static'));

dawg.get('/', function(req, res) {
  res.send("BARK");
});

dawg.get('/slag', function(req, res) {
  slag(function(err, count){
    if(err) res.json(err, 500);
    res.json(count);
  })
});

// error handling
dawg.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  // TODO:  Decide if this should go to alerting!
  res.json('Something went wrong.', 500);
});

exports.startService = function(port, ip, cb) {
  dawg.listen(port, ip, function() {
    cb(dawg);
  });
};

function slag(cb)
{
  dal.query("select count(*) as cnt from SyncSchedule where nextRun < UNIX_TIMESTAMP(NOW())", function(err, ret){
    cb(err, ret && ret[0] && ret[0].cnt);
  })
}

// simple util for consistent but flexible binary options
function isTrue(field)
{
  if(!field) return false;
  if(field === true) return true;
  if(field == "true") return true;
  if(field == "1") return true;
  if(field == "yes") return true;
  return false;
}

