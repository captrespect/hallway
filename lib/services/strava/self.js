var path = require('path');
var lib = require('./lib.js');

exports.sync = function(pi, cb) {
	lib.getProfile(pi.auth, function(err, resp, profile){
		if(err || !profile) return cb(err);
		var self = profile;
		var auth = pi.auth;
		auth.profile = self;
		auth.pid = auth.athlete_id + '@strava';
		var base = 'contact:'+auth.pid+'/self';
		var data = {};
		data[base] = [self];
		cb(null, {auth:auth, data:data});
	});
};
