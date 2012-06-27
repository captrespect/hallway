var lib = require('./lib.js');


exports.sync = function(pi, cb) {
	since = pi.config.fitnessSince || '0000-00-00';
	lib.getActivities({type: "fitness",Type:"Fitness", since:since, token:pi.auth.token.access_token}, function(err, fitnessActs) {
		var data = {};
		data['activity:' + pi.auth.pid+'/fitness_acts'] = fitnessActs;
		if (fitnessActs.length > 0) pi.config.fitnessSince = (new Date(fitnessActs[0].start_time)).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
