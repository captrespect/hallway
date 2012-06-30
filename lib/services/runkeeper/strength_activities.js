var lib = require('./lib.js');

exports.sync = function(pi, cb) {
	var since = pi.config.strengthSince || '0000-00-00';
	lib.getData({query: "strengthTrainingActivities",type:"StrengthTrainingActivityFeed", since:since, token:pi.auth.token.access_token}, function(err, strengthActs) {
		var data = {};
		data['activity:' + pi.auth.pid+'/strength_acts'] = strengthActs;
		pi.config.strengthSince = (new Date()).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
