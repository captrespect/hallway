var lib = require('./lib.js');


exports.sync = function(pi, cb) {
	var since = pi.config.recordsSince || '0000-00-00';
	lib.getData({query: "records",type:"Records", since:since, token:pi.auth.token.access_token}, function(err, records) {
		var data = {};
		data['record:' + pi.auth.pid+'/records'] = records;
		pi.config.recordsSince = (new Date()).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
};
