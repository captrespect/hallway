var lib = require('./lib.js');

exports.sync = function(pi, cb) {
	since = pi.config.strengthSince || '0000-00-00';
	lib.getActivities({type: "strengthTraining",Type:"StrengthTraining", since:since, token:pi.auth.token.access_token}, function(err, strengthActs) {
		var data = {};
		data['activity:' + pi.auth.pid+'/strength_acts'] = strengthActs;
		if (strengthActs.length > 0) pi.config.strengthSince = (new Date(strengthActs[0].start_time)).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
