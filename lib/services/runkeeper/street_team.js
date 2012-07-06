var lib = require('./lib.js');


exports.sync = function(pi, cb) {
	since = pi.config.teamSince || '0000-00-00';
	lib.getData({query: "team",type:"TeamFeed", since:since, token:pi.auth.token.access_token}, function(err, contacts) {
		var data = {};
		data['contact:' + pi.auth.pid+'/team_feed'] = contacts;
		pi.config.teamSince = (new Date()).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
