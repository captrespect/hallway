var express = require('express');
var connect = require('connect');
var logger = require('logger').logger("worker");
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

var sman;
var airbrake;

var worker = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    logger.debug("REQUEST %s", req.url);
    return next();
  }
);

worker.use(express.static(__dirname + '/../static'));

worker.get('/', function(req, res) {
  var ret = {};
  ret.backlog = sman.backlog();
  ret.active = sman.active();
  res.json(ret);
});


// error handling
worker.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  res.json(err, 500);
});

exports.startService = function(sm, port, ip, cb) {
  sman = sm;
  worker.listen(port, ip, function() {
    cb(worker);
  });

  setInterval(function() {
  }, 60000);
};

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

