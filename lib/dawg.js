var express = require('express');
var connect = require('connect');
var logger = require('logger').logger('dawg');
var async = require('async');
var crypto = require('crypto');
var syncManager = require('syncManager');
var profileManager = require('profileManager');
var ijod = require('ijod');
var pipeline = require('pipeline');
var acl = require('acl');
var instruments = require("instruments");
var lconfig = require('lconfig');
var dal = require('dal');
var alerting = require('alerting');
var request = require('request');
var serializer = require('serializer').createSecureSerializer(lconfig.authSecrets.crypt, lconfig.authSecrets.sign);
var ec2 = require('aws2js').load('ec2');
var cloudwatch = require('aws2js').load('cloudwatch');
var _ = require('underscore');

var airbrake;
var apiHostArray = [];
var workerArray = [];
var globals = { ijodtotal: 0, ijodlast: 0, ijodcache: [] };

if (!lconfig.ec2) {
  logger.error('You must set ec2.accessKeyId and ec2.secretKey in config.json.');

  process.exit(1);
}

function estimatedCharges(cb) {
  cloudwatch.request('GetMetricStatistics', {
    'Dimensions.member.1.Name': 'Currency',
    'Dimensions.member.1.Value': 'USD',
    'Namespace': 'AWS/Billing',
    'MetricName': 'EstimatedCharges',
    'Period': 60 * 60 * 6,
    'StartTime': new Date(new Date().valueOf() - 60 * 60 * 24 * 1000).toISOString(),
    'EndTime': new Date().toISOString(),
    'Statistics.member.1': 'Maximum',
    'Unit': 'None'
  }, function(err, res) {
    if (err || !res ||
      !res.GetMetricStatisticsResult ||
      !res.GetMetricStatisticsResult.Datapoints ||
      !res.GetMetricStatisticsResult.Datapoints.member) {
      return cb(err);
    }

    var values = _.map(res.GetMetricStatisticsResult.Datapoints.member, function(point) {
      return parseFloat(point.Maximum, 10);
    }).sort(function(a, b) { return b - a; });

    cb(err, values[0]);
  });
}

function instanceAddresses(groupName, cb) {
  ec2.request('DescribeInstances', {
    'Filter.1.Name': 'group-name',
    'Filter.1.Value.1': groupName,
    'Filter.2.Name': 'instance-state-name',
    'Filter.2.Value.1': 'running'
  }, function(err, res) {
    var addresses = [];

    if (err || !res)
      return cb(addresses);

    res.reservationSet.item.forEach(function(reservation) {
      var items = reservation.instancesSet.item;

      if (!Array.isArray(items)) {
        items = [items];
      }

      items.forEach(function(instance) {
        addresses.push({
          publicIp: instance.ipAddress,
          privateIp: instance.privateIpAddress
        });
      });
    });

    cb(addresses);
  });
}

function instanceCounts(cb) {
  try {
    ec2.request('DescribeInstances', {
      'Filter.1.Name': 'instance-state-name',
      'Filter.1.Value.1': 'running'
    }, function(err, res) {
      var names = {};
      var counts = [];

      if (err || !res)
        return cb(err);

      res.reservationSet.item.forEach(function(reservation) {
        var items = reservation.instancesSet.item;

        if (!Array.isArray(items)) {
          items = [items];
        }

        items.forEach(function(instance) {
          var tagItems = instance.tagSet.item;

          if (!Array.isArray(tagItems)) {
            tagItems = [tagItems];
          }

          var elb = false;

          // We only want instances that are part of an ELB
          tagItems.forEach(function(tag) {
            if (tag.key === 'aws:autoscaling:groupName') {
              elb = true;
            }
          });

          if (elb) {
            tagItems.forEach(function(tag) {
              if (tag.key === 'Name') {
                if (typeof names[tag.value] === 'undefined') {
                  names[tag.value] = 0;
                }

                names[tag.value]++;
              }
            });
          }
        });
      });

      for (var name in names) {
        counts.push({
          name: name,
          count: names[name]
        });
      }

      cb(null, counts);
    });
  } catch (err) {
    cb(err);
  }
}

function authorize(user, pass) {
  if(!lconfig.dawg || !lconfig.dawg.password) return false;
  var ret = 'dawg' === user & pass === lconfig.dawg.password;
  return ret;
}

var host = 'http://localhost:' + lconfig.dawg.port;

if (lconfig.dawg && lconfig.dawg.host) {
  host = lconfig.dawg.host;
}

var dawg = express.createServer(
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
    if (req.method === 'OPTIONS') {
      res.send(200);

      return;
    }

    next();
  },
  express.basicAuth(authorize)
);

dawg.use(express.static(__dirname + '/../static'));

dawg.get('/slag', function(req, res) {
  slag(function(err, ret){
    if(err) return res.json(err, 500);
    slack(function(err, js){
      if(err) return res.json(err, 500);
      ret.slack = js;
      res.json(ret);
    })
  })
});

dawg.get('/aws/estimatedCharges', function(req, res) {
  estimatedCharges(function(err, charges) {
    if (err || !charges) {
      return res.json(err, 500);
    }

    return res.json(charges);
  });
});

dawg.get('/aws/counts', function(req, res) {
  instanceCounts(function(err, counts) {
    if (err || !counts) {
      return res.json(err, 500);
    }

    res.json(counts);
  });
});

dawg.get('/stats/ijod', function(req, res) {
  // calculated every 10min below
  res.json({count:globals.ijodtotal});
});

dawg.get('/stats/bam', function(req, res) {
  // calculated every 10min below
  res.json({AppsPerProfile:globals.app, ProfilesPerAccount:globals.ppa});
});

dawg.get('/profiles/breakdown', function(req, res) {
  var sql = "select service, count(*) as cnt from Profiles ";
  var binds = [];
  if(req.query.since) {
    sql += " where cat > from_unixtime(?) ";
    binds.push(req.query.since);
  }
  sql += " group by service"
  dal.query(sql, binds, function(err, ret){
    if(err) return res.json(err, 500);
    if(!ret || !ret[0]) return res.json({});
    var ndx = {};
    ret.forEach(function(row){ if(row.service && row.service.length > 0) ndx[row.service] = row.cnt })
    res.json(ndx);
  });
});

dawg.get('/syncSchedule/active', function(req, res) {
  dal.query('SELECT SyncSchedule.worker, SyncSchedule.task, SyncSchedule.state ' +
    'FROM SyncSchedule ' +
    'WHERE worker IS NOT NULL;', [], function(err, ret) {
      if (err) {
        return res.json(err, 500);
      }

      if (!ret || !ret[0]) {
        return res.json([]);
      }

      ret.forEach(function(row) {
        row.task = JSON.parse(row.task);
      });

      res.json(ret);
  });
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

function idhex(id) {return crypto.createHash('md5').update(id).digest('hex') }

dawg.get('/profiles/resync', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  dal.query("update Profiles set config = ? where id = ? limit 1", ['{}', req.query.pid], function(err, ret){
    if(err) return res.json(err, 500);
    // need to make this query better, explicit?
    dal.query("update SyncSchedule set nextRun = 0 where `key` like ? limit 10", [req.query.pid+'/%'], function(err, ret){
      if(err) return res.json(err, 500);
      logger.anubis(req,{act:idhex(req.query.pid), app:'singly'})
      res.json(true);
    });
  });
});

dawg.get('/profiles/get', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  profileManager.allGet(req.query.pid, function(err, ret){
    if(err) return res.json(err, 500);
    dal.query("select app, account from Accounts where profile = ?", [req.query.pid], function(err, apps){
      if(err) return res.json(err, 500);
      if(apps) apps.forEach(function(app){
        app.token = serializer.stringify([app.account, app.app, +new Date, null]);
      });
      ret.apps = apps;
      res.json(ret);
    });
  });
});

dawg.get('/profiles/search', function(req, res) {
  if(!req.query.q) return res.json("missing ?q=foo",500);
  dal.query("select id, cat from Profiles where auth like ? limit 100", ['%'+req.query.q+'%'], function(err, ret){
    if(err) return res.json(err, 500);
    if(!ret || !ret[0]) return res.json([]);
    res.json(ret);
  });
});

dawg.get('/profiles/note', function(req, res) {
  if(!req.query.pid) return res.json("missing ?pid=id@service",500);
  if(!req.query.note) return res.json("missing ?note=this+is+my+note",500);
  logger.anubis(req,{act:idhex(req.query.pid), app:'singly', type:'note', note:req.query.note});
  res.json(true);
});

dawg.get('/profiles/notes', function(req, res) {
  var id = (req.query.pid) ? idhex(req.query.pid)+'@' : '';
  var base = 'logs:'+id+'singly/anubis';
  var ret = [];
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  ijod.getRange(base, options, function(item) { ret.push(item) }, function(err) {
    res.send(ret);
  });
});

// Return information about a specific app given its key
dawg.get('/apps/get', function(req, res) {
  if (!req.query.key) {
    return res.json("missing ?key=foo", 500);
  }

  dal.query("SELECT * FROM Apps WHERE app = ? OR notes LIKE ? LIMIT 1",
      [req.query.key, '%' + req.query.key + '%'],
      function(err, ret) {
    if (err) {
      return res.json(err, 500);
    }

    if (!ret || !ret[0]) {
      return res.json([]);
    }

    async.forEach(ret, function(row, cbForEach) {
      if (row.apikeys) {
        row.apikeys = JSON.parse(row.apikeys);
      }

      if (row.notes) {
        row.notes = JSON.parse(row.notes);

        var idr = 'profile:' + row.notes.account + '@singly-dev-registration/self#' + row.notes.account;

        ijod.getOne(idr, function(err, profile) {
          if (!err && profile) {
            row.profile = profile;
          }

          cbForEach();
        });
      } else {
        cbForEach();
      }
    }, function() {
      res.json(ret);
    });
  });
});

dawg.get('/apps/logs', function(req, res) {
  if(!req.query.key) return res.json("missing ?key=foo",500);
  var base = 'logs:'+req.query.key+'/anubis';
  var ret = [];
  var options = {};
  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;
  options.limit = parseInt(req.query['limit'] || 20);
  options.q = req.query.q;
  ijod.getRange(base, options, function(item) { ret.push(item) }, function(err) {
    res.send(ret);
  });
});

dawg.get('/apps/account', function(req, res) {
  if(!req.query.id) return res.json("missing ?id=a23512b4234",500);
  dal.query("select app, account, profile from Accounts where account = ?", [req.query.id], function(err, profiles){
    if(err) return res.json(err, 500);
    if(!profiles || profiles.length == 0) return res.json({},404);
    var ret = {};
    ret.app = profiles[0].app;
    ret.id = profiles[0].account;
    ret.profiles = [];
    ret.token = serializer.stringify([ret.id, ret.app, +new Date, null]);
    profiles.forEach(function(row){
      ret.profiles.push(row.profile);
    });
    res.json(ret);
  });
});

function appCounts(req, res, options) {
  var binds = [];

  var appSince = '';
  var accountSince = '';

  if (req.query.appSince) {
    appSince = "AND Apps.cat > FROM_UNIXTIME(?) ";

    binds.push(req.query.appSince);
  }

  if (req.query.accountSince) {
    accountSince = "AND Accounts.cat > FROM_UNIXTIME(?) ";

    binds.push(req.query.accountSince);
  }

  var count = "COUNT(Accounts.account)";

  if (options && options.accounts) {
    count = "COUNT(DISTINCT Accounts.account)";
  }

  var sql = "SELECT " + count + " AS accountCount, Apps.app, Apps.notes, Apps.cat " +
      "FROM Accounts, Apps " +
      "WHERE Apps.app = Accounts.app " +
      appSince +
      accountSince +
      "GROUP BY Apps.app";

  dal.query(sql, binds, function(err, accounts) {
    if (err) {
      return res.json(err, 500);
    }

    if (!accounts || accounts.length === 0) {
      return res.json([], 404);
    }

    var ret = [];

    accounts.forEach(function(row) {
      ret.push({
        id: row.app,
        created: row.cat,
        accounts: row.accountCount
      });
    });

    res.json(ret);
  });
}

dawg.get('/apps/profiles', function(req, res) {
  appCounts(req, res);
});

dawg.get('/apps/accounts', function(req, res) {
  appCounts(req, res, { accounts: true });
});

function apiHostState(cb) {
  var apiHosts = [];
  var unresponsive = [];

  async.forEach(apiHostArray, function(apiHost, cbForEach) {
    var ip = apiHost.publicIp;

    if (process.env.NODE_ENV === 'production') {
      ip = apiHost.privateIp;
    }

    request.get({ uri: 'http://' + ip + ':8042/state', json: true, timeout: 5000 }, function(err, res, js) {
      if (err && err.code === 'ETIMEDOUT') {
        unresponsive.push(ip);

        return cbForEach();
      }

      if (typeof js !== 'object') {
        return cbForEach();
      }

      js.publicIp = apiHost.publicIp;
      js.privateIp = apiHost.privateIp;

      apiHosts.push(js);

      cbForEach();
    });
  }, function() {
    cb({
      apiHosts: apiHosts,
      unresponsive: unresponsive
    });
  });
}

function workerState(cb) {
  var backlog = 0;
  var active = 0;
  var workers = [];
  var unresponsive = [];

  async.forEach(workerArray, function(worker, cbForEach) {
    var ip = worker.publicIp;

    if (process.env.NODE_ENV === 'production') {
      ip = worker.privateIp;
    }

    request.get({ uri: 'http://' + ip + ':8041', json: true, timeout: 5000 }, function(err, res, js) {
      if (err && err.code === 'ETIMEDOUT') {
        unresponsive.push(ip);

        return cbForEach();
      }

      if (typeof js !== 'object') {
        return cbForEach();
      }

      js.publicIp = worker.publicIp;
      js.privateIp = worker.privateIp;

      workers.push(js);

      backlog += js.backlog;
      active += js.active.length;

      cbForEach();
    });
  }, function() {
    cb({
      active: active,
      backlog: backlog,
      workers: workers,
      unresponsive: unresponsive
    });
  });
}

dawg.get('/workers/state', function(req, res) {
  workerState(function(state) {
    res.json(state);
  });
});

dawg.get('/apiHosts/state', function(req, res) {
  apiHostState(function(state) {
    res.json(state);
  });
});

dawg.get('/links/:type', function(req, res) {
  // Prevent a very expensive query
  if (!req.query.q || req.query.q === '') {
    return res.json([]);
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.write('[');

  var options = {};

  if(req.query['offset']) options.offset = parseInt(req.query['offset']) || 0;

  options.limit = parseInt(req.query['limit'] || 20);
  options.q = req.query.q;

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

function activeApps(opt_since, cb) {
  var options = {
    since: Date.now() - (31556926 * 1000)
  };

  if (parseInt(opt_since)) {
    options.since = parseInt(opt_since);
  }

  acl.getApps(function(err, all) {
    if (err || !all) {
      cb(err);

      return;
    }

    var count = 0;
    var total = 0;
    var hits = {};

    async.forEach(all, function(row, cbForEach) {
      ijod.getBounds('logs:' + row.app + '/anubis', options, function(err, bounds) {
        if (!bounds || bounds.total == 0) return cbForEach();
        count++;
        total += parseInt(bounds.total);
        hits[row.app] = parseInt(bounds.total);
        cbForEach();
      });
    }, function() {
      hits.total = total;
      cb(null, count, hits);
    });
  });
}

dawg.get('/apps/active', function(req, res) {
  activeApps(req.query.since, function(err, count) {
    if (err) {
      res.json(err, 500);
    } else {
      res.json(count);
    }
  });
});

dawg.get('/apps/hits', function(req, res) {
  activeApps(req.query.since, function(err, count, hits) {
    if (err) return res.json(err, 500);
    res.json(hits);
  });
});

// Get a system-wide id uniquely
dawg.get('/id/:id', function(req, res) {
  var id = req.params.id || req.url.substr(1);
  if(id && id.indexOf('_') > 0) id = id.substr(0,id.indexOf('_'));  // for future use, the second part used for sharding hints, possible validation, etc
  ijod.getOne(id, function(err, entry) {
    if (err) logger.warn(err);
    if (!entry) return res.json("not found",404);
    res.json(entry);
  });
});


// error handling
dawg.error(function(err, req, res, next) {
  if(err.stack) logger.error(err.stack);
  res.json(err, 500);
});

function updateApiHostArray() {
  instanceAddresses('hallway', function(addresses) {
    apiHostArray = addresses;
  });
}

function updateWorkerArray() {
  instanceAddresses('worker', function(addresses) {
    workerArray = addresses;
  });
}

exports.startService = function(port, ip, cb) {
  dawg.listen(port, ip, function() {
    cb(dawg);
  });

  ec2.setCredentials(lconfig.ec2.accessKeyId, lconfig.ec2.secretKey);
  cloudwatch.setCredentials(lconfig.ec2.accessKeyId, lconfig.ec2.secretKey);

  ec2.setRegion('us-east-1');
  cloudwatch.setRegion('us-east-1');

  updateApiHostArray();
  updateWorkerArray();

  // Update the instance arrays from EC2 every 5 minutes
  setInterval(updateApiHostArray, 5 * 60 * 1000);
  setInterval(updateWorkerArray, 5 * 60 * 1000);

  // minutelies
  setInterval(function() {
    slag(function(err, res) {
      if (err || typeof res !== 'object') {
        return;
      }

      instruments.gauge({
        'slag.count': res.cnt,
        'slag.lag': res.lag
      }).send();

      if (res.lag > 180) {
        alerting.alert("high slag of " + parseInt(res.lag) + " seconds", {
          details: {
            'slag count': res.cnt,
            'slag lag': res.lag
          },
          key: 'slag'
        });
      }
    });

    slack(function(err, res) {
      if (err || typeof res !== 'object') {
        return;
      }

      instruments.gauge({
        'slack.count': res.cnt,
        'slack.lag': res.lag
      }).send();
    });

    workerState(function(status) {
      if (typeof status !== 'object') {
        return;
      }

      instruments.gauge({
        'workers.active': status.active,
        'workers.backlog': status.backlog
      }).send();
    });

    activeApps(Date.now() - 300000, function(err, count) {
      if (err) {
        return;
      }

      instruments.gauge({
        'apps.active.5m': count
      }).send();
    });
  }, 60000);

  // 10-minutelys
  setInterval(function() {
    AppAcctProfiles(function(){});
    // this is expensive on innodb so do less frequently
    activeApps(Date.now() - 86400000, function(err, count) {
      if (err) {
        return;
      }

      instruments.gauge({
        'apps.active.24h': count
      }).send();
    });
  }, 600000);

  AppAcctProfiles(function(){});
  // 10-secondlys
  setInterval(function() {
    ijodcounter();
  }, 10000);

  ijodcounter();
};


function ijodcounter()
{
  dal.query("SHOW TABLE STATUS LIKE 'ijod'", [], function(err, ret){
    if(err || !ret || !ret[0]) return;
    globals.ijodlast = globals.ijodtotal;
    globals.ijodcache.unshift(parseInt(ret[0].Rows));
    globals.ijodcache = globals.ijodcache.slice(0,60);
    var cnt = 0;
    var tot = 0;
    globals.ijodcache.forEach(function(rows){cnt++; tot += rows});
    globals.ijodtotal = parseInt((tot/cnt));
  });
}

function AppAcctProfiles(cb)
{
  dal.query("select avg(sq1.cnt) as app, avg(sq2.cnt) as ppa from (select count(*) as cnt from Accounts group by profile) as sq1, (select count(*) as cnt from Accounts group by account) as sq2", [], function(err, ret){
    if(ret && ret[0])
    {
      globals.app = ret[0].app;
      globals.ppa = ret[0].ppa;
      instruments.gauge({
        'bam.appsperprofile': globals.app,
        'bam.profilesperaccount': globals.ppa
      }).send();
    }
    cb(err, ret && ret[0]);
  })
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
