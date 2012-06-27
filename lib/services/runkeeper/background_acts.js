var lib = require('./lib.js');


exports.sync = function(pi, cb) {
	since = pi.config.backgroundSince || '0000-00-00';
	lib.getActivities({type: "background",Type:"Background", since:since, token:pi.auth.token.access_token}, function(err, backgroundActs) {
		var data = {};
		data['activity:' + pi.auth.pid+'/background_acts'] = backgroundActs;
		if (backgroundActs.length > 0) pi.config.backgroundSince = (new Date(backgroundActs[0].start_time)).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
