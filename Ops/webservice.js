/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var url = require("url");
var http = require('http');
var request = require('request');
var lscheduler = require("lscheduler");
var levents = require("levents");
var lutil = require('lutil');
var serviceManager = require("lservicemanager");
var express = require('express');
var connect = require('connect');
var request = require('request');
var path = require('path');
var fs = require("fs");
var url = require('url');
var querystring = require("querystring");
var lfs = require(__dirname + "/../Common/node/lfs.js");
var httpProxy = require('http-proxy');
var lpquery = require("lpquery");
var lconfig = require("lconfig");
var logger = require('logger');
var async = require('async');
var syncManager = require(path.join(lconfig.lockerDir, "Services", "SyncManager", "syncmanager.js"));
var authManager = require("authManager");


var lcrypto = require("lcrypto");

// var proxy = new httpProxy.RoutingProxy();
var scheduler = lscheduler.masterScheduler;

var airbrake;

var locker = express.createServer(
    connect.bodyParser(),
    connect.cookieParser(),
    connect.session({key:'locker.project.id', secret : "locker"}),
    authManager.provider.oauth(),
    authManager.provider.login()
    // ,function(req, res, next) {
    //   if(req.url.indexOf('/auth/') === 0 || (req.session.account_id && req.session.account_id !== '')) return next();
    //   res.send(401);
    // }
);

locker.get("/awesome", function(req, res) {
  if(req.awesome) return res.send(req.awesome);
  res.send(false);
});

var listeners = {}; // listeners for events

var DEFAULT_QUERY_LIMIT = 20;

// return the known map of our world
locker.get('/map', function(req, res) {
    var copy = {};
    lutil.extend(true, copy, serviceManager.map());
    Object.keys(copy).forEach(function(key){
        if(copy[key].auth) copy[key].auth = {profile:copy[key].auth.profile}; // silence keys
    });
    res.send(copy);
});

locker.get('/map/profiles', function(req, res) {
    var profiles = {};
    var map = serviceManager.map();
    for(var key in map) {
        if(!map[key].auth || !map[key].auth.profile) continue;
        var idr = { slashes: true, pathname: '/', host: key };
        // the type could be named something service-specific, usually 'contact' tho
        idr.protocol = (map[key].types && map[key].types.contact) ? map[key].types.contact : 'contact';
        // generate idrs from profiles, some services have both numeric and username (or more?)!
        var ids = map[key].profileIds || ['id'];
        for(var i in ids) {
            var id = ids[i];
            if(!map[key].auth.profile[id]) continue;
            idr.hash = map[key].auth.profile[id];
            profiles[url.format(idr)] = map[key].auth.profile;
        }
    }
    res.send(profiles);
});

locker.post('/map/upsert', function(req, res) {
    logger.info("Upserting " + req.param("manifest"));
    res.send(serviceManager.mapUpsert(req.param("manifest")));
});

locker.get("/providers", function(req, res) {
    if (!req.param("types")) return res.send([], 400);
    res.send(serviceManager.providers(req.param('types').split(',')));
});

locker.get("/provides", function(req, res) {
    var services = serviceManager.map();
    var ret = {};
    for(var i in services) if(services[i].provides) ret[i] = services[i].provides;
    res.send(ret);
});

locker.get("/encrypt", function(req, res) {
    if (!req.param("s")) {
        res.writeHead(400);
        res.end();
        return;
    }
    logger.info("encrypting " + req.param("s"));
    res.end(lcrypto.encrypt(req.param("s")));
});

locker.get("/decrypt", function(req, res) {
    if (!req.param("s")) {
        res.writeHead(400);
        res.end();
        return;
    }
    res.end(lcrypto.decrypt(req.param("s")));
});

// search interface
locker.get("/query/:query", function(req, res) {
    if(!url.parse(req.originalUrl).query)
        req.originalUrl += "?limit=" + DEFAULT_QUERY_LIMIT;
    var data = decodeURIComponent(req.originalUrl.substr(6)).replace(/%21/g, '!').replace(/%27/g, "'").replace(/%28/g, '(').replace(/%29/g, ')').replace(/%2a/ig, '*');
    try {
        var query = lpquery.buildMongoQuery(lpquery.parse(data));
        var providers = serviceManager.map();
        var provider;
        for (var key in providers) {
            if (providers.hasOwnProperty(key) && providers[key].provides && providers[key].provides.indexOf(query.collection) >= 0 )
                provider = providers[key];
        }

        if (provider === undefined) {
            res.writeHead(404);
            res.end(query.collection + " not found to query");
            return;
        }

        var mongo = require("lmongo");
        mongo.init(provider.id, provider.mongoCollections, function(mongo, colls) {
            try {
                var collection = colls[provider.mongoCollections[0]];
                logger.info("Querying " + JSON.stringify(query));
                var options = {};
                options.limit = query.limit || DEFAULT_QUERY_LIMIT;
                if (query.skip) options.skip = query.skip;
                if (query.fields) options.fields = query.fields;
                if (query.sort) options.sort = query.sort;
                collection.find(query.query, options, function(err, foundObjects) {
                    if (err) {
                        res.writeHead(500);
                        res.end(err);
                        return;
                    }

                    foundObjects.toArray(function(err, objects) {
                        res.end(JSON.stringify(objects));
                    });
                });
            } catch (E) {
                res.writeHead(500);
                res.end('Something broke while trying to query Mongo : ' + E);
            }
        });
    } catch (E) {
        res.writeHead(400);
        res.end("Invalid query " + req.originalUrl.substr(6) + "<br />" + E);
    }
});

// let any service schedule to be called, it can only have one per uri
locker.get('/core/:svcId/at', function(req, res) {
    var seconds = req.param("at");
    var cb = req.param('cb');
    var svcId = req.params.svcId;
    if (!seconds || !svcId || !cb) {
        res.writeHead(400);
        res.end("Invalid arguments");
        return;
    }
    if (!serviceManager.map(svcId)) {
        res.writeHead(404);
        res.end(svcId+" doesn't exist, but does anything really? ");
        return;
    }
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    var at = new Date();
    at.setTime(seconds * 1000);
    scheduler.at(at, svcId, cb);
    logger.info("scheduled "+ svcId + " " + cb + "  at " + at);
    res.end("true");
});

var collectionApis = serviceManager.getCollectionApis();
for(var i in collectionApis) {
  locker._oldGet = locker.get;
  locker.get = function(path, callback) {
    return locker._oldGet('/Me/' + i + path, callback);
  };
  collectionApis[i].api(locker, collectionApis[i].lockerInfo);
  locker.get = locker._oldGet;
  locker._oldGet = undefined;
}

locker.get('/synclets/:id/run', function(req, res) {
    syncManager.syncNow(req.params.id, req.query.id, false, function(err) {
        if(err) return res.send(err, 500);
        res.send(true);
    });
});

// this will pass the post body to the synclet and run it immediately
locker.post('/post/:id/:synclet', function(req, res) {
    syncManager.syncNow(req.params.id, req.params.synclet, req.body, function() {
        res.send(true);
    });
});

// all synclet getCurrent, id, etc stuff
// require('synclet/dataaccess')(locker);

locker.get('/core/error', function(req, res) {
    throw new Error("Hmm...This is a REAL job for STUPENDOUS MAN!");
});

locker.get('/core/revision', function(req, res) {
    fs.readFile(path.join(lconfig.lockerDir, 'build.json'), function(err, doc) {
        if (err) return logger.error(err);
        if (doc) res.send(JSON.parse(doc));
        else res.send("unknown");
    });
});

locker.get('/core/selftest', function(req, res) {
    async.series([
        function(callback) {
            fs.readdir(lconfig.me, function(err, files) {
                if (err) {
                    callback({ 'Me/*' : err}, null);
                } else {
                    callback(null, { 'Me/*' : files });
                }
            });
        }
    ],
    function(err, results) {
        if (err) {
            res.send(err, 500);
        } else {
            res.send(JSON.stringify(results), 200);
        }
    });
});

locker.get('/core/stats', function(req, res) {
    var stats = {
        'core' : {
            'memoryUsage' : process.memoryUsage()
        },
        'serviceManager': {}
    };

    var map = serviceManager.map();
    for (var serviceId in map) {
        var type = map[serviceId].type;

        if (!(type in stats.serviceManager)) {
            stats.serviceManager[type] = {
                'total' : 0,
                'running' : 0
            };
        }

        stats.serviceManager[type].total += 1;
        if (serviceManager.isRunning(serviceId))
            stats.serviceManager[type].running += 1;
    }

    // serviceManager never reports that a connector is running
    if ('connector' in stats.serviceManager)
        delete stats.serviceManager.connector.running;

    res.send(JSON.stringify(stats), 200);
});

// EVENTING
// anybody can listen into any service's events
locker.get('/core/:svcId/listen', function(req, res) {
    var type = req.param('type'), cb = req.param('cb');
    var svcId = req.params.svcId;
    if(!serviceManager.map(svcId)) {
        logger.error("Could not find " + svcId);
        res.writeHead(404);
        res.end(svcId+" doesn't exist, but does anything really? ");
        return;
    }
    if (!type || !cb) {
        res.writeHead(400);
        res.end("Invalid type or callback");
        return;
    }
    if(cb.substr(0,1) != "/") cb = '/'+cb; // ensure it's a root path
    var batching = false;
    if (req.param("batch") === "true" || req.param === true) batching = true;
    levents.addListener(type, svcId, cb, batching);
    res.writeHead(200);
    res.end("OKTHXBI");
});

// Stop listening to some events
locker.get("/core/:svcId/deafen", function(req, res) {
    var type = req.param('type'), cb = req.param('cb');
    var svcId = req.params.svcId;
    if(!serviceManager.map(svcId)) {
        res.writeHead(404);
        res.end(svcId+" doesn't exist, but does anything really? ");
        return;
    }
    if (!type || !cb) {
        res.writeHead(400);
        res.end("Invalid type or callback");
        return;
    }
    if(cb.substr(0,1) != "/") cb = '/'+cb; // ensure it's a root path
    levents.removeListener(type, svcId, cb);
    res.writeHead(200);
    res.end("OKTHXBI");
});

// publish an event to any listeners
locker.post('/core/:svcId/event', function(req, res) {
    if (!req.body ) {
        res.writeHead(400);
        res.end("Post data missing");
        return;
    }
    var fromService = serviceManager.map(req.params.svcId);
    if(!fromService) {
        res.writeHead(404);
        res.end(req.params.svcId+" doesn't exist, but does anything really? ");
        return;
    }
    fromService.last = Date.now();
    if (!req.body.idr || !req.body.data || !req.body.action) {
        res.writeHead(400);
        res.end("Invalid, missing idr, data, or action");
        return;
    }
    levents.fireEvent(req.body.idr, req.body.action, req.body.data);
    res.writeHead(200);
    res.end("OKTHXBI");
});

// manually flush any waiting synclets, useful for debugging/testing
locker.get('/flush', function(req, res) {
    res.send(true);
    syncManager.flushTolerance(function(err){
        if(err) logger.error("got error when flushing synclets: "+err);
    }, req.query.force);
});

locker.use(express.static(__dirname + '/static'));

locker.error(function(err, req, res, next){
    if(err.stack) logger.error(err.stack);
    if (airbrake) {
        airbrake.notify(err, function(err, url) {
            if (url) logger.error(url);
        });
    }
    res.send("Something went wrong.", 500);
});

require("./webservice-synclets")(locker);
require('./webservice-push')(locker);


locker.initAirbrake = function(key) {
    airbrake = require('airbrake').createClient(key);
};

exports.startService = function(port, ip, cb) {
    locker.listen(port, ip, function(){
        cb(locker);
    });
};


// locker.get('/auth/:id', function(req, res) {
//   authManager.startServiceAuth(provider, req, res, onComplete);
// });
locker.get('/auth/:id/auth', function(req, res) {
  authManager.authIsAuth(req.params.id, req, res);
});
locker.post('/auth/:id/auth', function(req, res) {
  authManager.authIsAuth(req.params.id, req, res);
});

// locker.get('/deauth/:id', deauthIsAwesomer);
