var lib = require('./lib.js');


exports.sync = function(pi, cb) {
	var since = pi.config.fitnessSince || '0000-00-00';
	lib.getData({query: "fitnessActivities",type:"FitnessActivityFeed", since:since, token:pi.auth.token.access_token}, function(err, fitnessActs) {
		var data = {};
		data['activity:' + pi.auth.pid+'/fitness_acts'] = fitnessActs;
		pi.config.fitnessSince = (new Date()).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
