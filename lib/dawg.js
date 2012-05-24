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
var dal = require('dal');

var airbrake;

function authorize(user, pass) {
  if(!lconfig.dawg || !lconfig.dawg.password) return false;
  var ret = 'dawg' === user & pass === lconfig.dawg.password;
  return ret;
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

dawg.get('/links/:type', function(req, res) {
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
  res.write('[');
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  var written = 0;
  ijod.getRange(req.params.type+':links/oembed', options, function(item) {
    if(written > 0) res.write(',');
    written++;
    // given the map flag, try to map any known fields
    res.write(JSON.stringify(item));
  }, function(err) {
    if(err) logger.error('error sending results for links:',err);
    return res.end(']');
  });
});

// error handling
dawg.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  res.json(err, 500);
});

exports.startService = function(port, ip, cb) {
  dawg.listen(port, ip, function() {
    cb(dawg);
  });

  setInterval(function() {
    slag(function(err, cnt) {
      if (!err && cnt !== undefined) instruments.gauge({slag:cnt}).send();
    });
  }, 60000);
};

function slag(cb)
{
  dal.query("select count(*) as cnt from SyncSchedule where nextRun < UNIX_TIMESTAMP(NOW())", [], function(err, ret){
    if (cb) cb(err, ret && ret[0] && ret[0].cnt);
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

