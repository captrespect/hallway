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
  connect.cookieParser()
);

worker.use(express.static(__dirname + '/../static'));

var tstarted = Date.now();
worker.get('/', function(req, res) {
  var ret = {};
  ret.backlog = sman.backlog();
  ret.active = sman.actives();
  ret.total = sman.totals();
  var cnt = 0;
  var tot = 0;
  sman.lasts().forEach(function(task){cnt++; tot += (task.tdone - task.tstart)});
  ret.runtime = parseInt((tot/cnt)/1000);
  ret.uptime = parseInt((Date.now() - tstarted)/1000);
  res.json(ret);
});

worker.get('/debug', function(req, res) {
  syncManager.debug = isTrue(req.query.set);
  ijod.debug = isTrue(req.query.set);
  res.json(isTrue(req.query.set));
});

// public health check
worker.get('/enoch', function(req, res) {
  var good = req.query.true || true;
  var bad = req.query.false || false;
  if(req.query.fail) return res.json(bad, 500);
  dal.query('select true', [], function(err, row) {
    if(err) return res.json(bad, 500);
    if(!row || !row[0] || row[0].TRUE !== '1') return res.json(bad, 500);
    res.json(good)
  });
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

