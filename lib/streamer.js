var express = require('express');
var connect = require('connect');
var logger = require('logger').logger('stream');
var lutil = require('lutil');
var async = require('async');
var os = require('os');
var crypto = require('crypto');
var request = require('request');
var querystring = require('querystring');

var tstarted;
var version;
var total;
var api;
var myself;

var stream = express.createServer(
  connect.bodyParser(),
  connect.cookieParser(),
  function(req, res, next) {
    logger.debug("REQUEST %s", req.url);
    return next();
  },
  // enable CORS
  function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Authorization");

    // intercept OPTIONS method
    if (req.method === 'OPTIONS') return res.send(200);

    next();
  }
);
var io = require('socket.io').listen(stream);

var master = {};
io.sockets.on('connection', function (socket) {
  logger.debug('new client');
  socket.on('stream', function (arg, cb) {
    logger.debug("new stream request");
    var id = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
    master[id] = {
      socket:socket,
      id:id,
      started:Date.now()
    }
    socket.on(id, function (req) {
      var token = req.access_token;
      var filter = api + req.path + '?' + querystring.stringify(req.query);
      var dest = myself + '/stream/' + id;
      logger.debug("generating new pushback",filter,dest)
      var push = {};
      push[filter] = {url:dest};
      request.post({uri:api+'/push/upsert', qs:{access_token:token}, json:push}, function(err, resp, body){
        if(err) logger.warn(err);
        if(resp && resp.statusCode != 200) logger.warn(resp.statusCode, body);
      })
    });
    cb(id);
  });
});

// where the push events get sent to!
stream.post('/stream/:id', function(req, res){
  var id = req.params.id;
  if(!master[id]) return res.send(410);
  var client = master[id];
  if(client.socket.disconnected)
  {
    delete master[id];
    return res.send(410);
  }
  res.send(200);
  if(!Array.isArray(req.body)) return;
  req.body.forEach(function(entry){ client.socket.emit(id, entry) });
});

// public state information
stream.get('/state', function(req, res) {
  var ret = {
    version: version,
    total: total,
    uptime: parseInt((Date.now() - tstarted) / 1000),
    host: require("os").hostname(),
    os: {
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      totalmem: os.totalmem(),
      freemem: os.freemem()
    }
  };

  res.json(ret);
});

exports.startService = function(arg, cb) {
  stream.listen(arg.port, arg.listenIP, function() {
    cb(stream);
  });

  api = arg.apihost;
  myself = arg.streamhost;
  tstarted = Date.now();
  total = 0;

  lutil.currentRevision(function(err, hash) {
    version = hash;
  });
};