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
var alerting = require('alerting');

var airbrake;
var globals = {"ijodtotal":0,"ijodrate":0,"ijodlast":0};

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
  slag(function(err, ret){
    if(err) res.json(err, 500);
    slack(function(err, js){
      if(err) res.json(err, 500);
      ret.slack = js;
      res.json(ret);
    })
  })
});

dawg.get('/stats/ijod', function(req, res) {
  // calculated every 10min below
  res.json({count:globals.ijodtotal, rate:globals.ijodrate});
});

dawg.get('/profiles/syncing', function(req, res) {
  if(!req.query.q) return res.json("missing ?q=foo",500);
  dal.query("select * from SyncSchedule where `key` like ? limit 100", ['%'+req.query.q+'%'], function(err, ret){
    if(err) return res.json(err, 500);
    if(!ret || !ret[0]) return res.json([]);
    ret.forEach(function(row){ row.task = JSON.parse(row.task) });
    res.json(ret);
  });
});

dawg.get('/profiles/resync', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  dal.query("update Profiles set config = ? where id = ? limit 1", ['{}', req.query.pid], function(err, ret){
    if(err) return res.json(err, 500);
    res.json(true);
  });
});

dawg.get('/profiles/get', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  profileManager.allGet(req.query.pid, function(err, ret){
    if(err) return res.json(err, 500);
    res.json(ret);
  });
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

dawg.get('/apps/active', function(req, res) {
  var options = {limit:1};
  options.since = parseInt(req.query.since) || (Date.now() - 86400000); 
  acl.getApps(function(err, all){
    if(err || !all) res.json(err, 500);
    var count = 0;
    async.forEach(all, function(row, cb){
      ijod.getRange('logs:'+row.app+'/anubis', options, null, function(err, cnt) {
        if(cnt && cnt.length > 0) count++;
        cb();
      }, true); // true == SMOKE MONST3R
    }, function(){
      res.json(count);
    })
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

  // minutelies
  setInterval(function() {
    slag(function(err, res) {
      if(err || typeof res != 'object') return;
      instruments.gauge({slag:res.cnt}).send();
      if(res.cnt > 200) alerting.alert("slag too high","is currently "+res.cnt,{detail:true});
    });
    slack(function(err, res) {
      if (!err && res !== undefined) instruments.gauge({slack:res.cnt}).send();
    });
  }, 60000);

  // 10-minutelys
  setInterval(function() {
    // this is expensive on innodb so do less frequently
    ijodcounter();
  }, 600000);
  ijodcounter();
  
};

function ijodcounter()
{
  dal.query("select count(*) as cnt from ijod", [], function(err, ret){
    if(err || !ret || !ret[0]) return;
    globals.ijodlast = globals.ijodtotal;
    globals.ijodtotal = parseInt(ret[0].cnt)
    if(globals.ijodlast > 0) globals.ijodrate = (globals.ijodtotal - globals.ijodlast) / 600;
  });
}

function slag(cb)
{
  dal.query("select count(*) as cnt, avg(UNIX_TIMESTAMP(NOW()) - (nextRun/1000)) as lag from SyncSchedule where state = 0 and nextRun < UNIX_TIMESTAMP(NOW())*1000", [], function(err, ret){
    cb(err, ret && ret[0]);
  })
}

function slack(cb)
{
  dal.query("select count(*) as cnt, avg(UNIX_TIMESTAMP(NOW()) - (nextRun/1000)) as lag from SyncSchedule where state > 0 and nextRun < UNIX_TIMESTAMP(NOW())*1000", [], function(err, ret){
    cb(err, ret && ret[0]);
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

