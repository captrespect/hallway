var request = require('request');
var util = require('util');

exports.sync = function(pi, cb) {
	pi.auth.access_token = pi.auth.token.access_token;
	var uri = 'https://api.meetup.com/2/member/self?'+'access_token='+pi.auth.access_token;
	request.get({uri:uri, json:true}, function(err, resp, json){
		if(err || !json || !json.name) return cb(err);
		pi.auth.profile = json;
		pi.auth.pid = json.id+'@meetup';
		var base = 'member:'+pi.auth.pid+'/self';
		var data = {};
		data[base] = [json];
		cb(null, {auth: pi.auth, data: data});
	});
};
