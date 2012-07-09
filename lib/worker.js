var express = require('express');
var connect = require('connect');
var logger = require('logger').logger('worker');
var syncManager = require('syncManager');
var ijod = require('ijod');
var lconfig = require('lconfig');
var lutil = require('lutil');
var dal = require('dal');

var sman;
var tstarted;
var airbrake;
var version;

var worker = express.createServer(
  connect.bodyParser(),
  connect.cookieParser()
);

worker.get('/', function(req, res) {
  var cnt = 0;
  var tot = 0;

  sman.lasts().forEach(function(task) {
    cnt++;
    tot += (task.tdone - task.tstart);
  });

  var ret = {
    version: version,
    backlog: sman.backlog(),
    active: sman.actives(),
    total: sman.totals(),
    host: require("os").hostname(),
    runtime: (tot / cnt) / 1000,
    uptime: Math.floor((Date.now() - tstarted) / 1000)
  };

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
  tstarted = Date.now();

  lutil.currentRevision(function(err, hash) {
    version = hash;
  });

  worker.listen(port, ip, function() {
    logger.info('Worker status is now listening at ' + ip + ':' + port);

    cb(worker);
  });
};

// TODO: Extract somewhere
// simple util for consistent but flexible binary options
function isTrue(field) {
  if(!field) return false;
  if(field === true) return true;
  if(field == "true") return true;
  if(field == "1") return true;
  if(field == "yes") return true;
  return false;
}
