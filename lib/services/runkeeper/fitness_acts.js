

var request = require('request');
var util = require('util');
var url = require('url');

var logger = require('logger').logger("fitness_acts");

var pageSize = 4;

exports.sync = function(pi, cb) {
	since = pi.config.fitnessSince || '0000-00-00';
	getFitnessActs({type: "fitness",Type:"Fitness", since:since, token:pi.auth.token.access_token}, function(err, fitnessActs) {
		var data = {};
		data['activity:' + pi.auth.pid+'/fitness_acts'] = fitnessActs;
		if (fitnessActs.length > 0) pi.config.fitnessSince = (new Date(fitnessActs[0].start_time)).toISOString().substr(0,10);
		cb(err, {data:data, config:pi.config});
	});
}

function getFitnessActs(arg, callback){
	activities = arg.activities || [];
	var base = 'http://api.runkeeper.com/';
	if(!arg.uri) uri = base+arg.type+'Activities?pageSize='+pageSize+'&noEarlierThan=' + arg.since;
	else uri = arg.uri;
	request.get({url:url.parse(uri), headers:{'Content-type': 'application/vnd.com.runkeeper.'+arg.Type+'ActivityFeed+json', 'Host':'api.runkeeper.com', 'Authorization': 'Bearer '+arg.token, 'Accept':'application/vnd.com.runkeeper.'+arg.Type+'ActivityFeed+json'}, json:true}, function (err, resp, js){
		if(err) return callback(err);
		if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
		if(!js || !js.items) return callback(new Error("missing js.items: "+util.inspect(js)));
		js.items.forEach(function(item){
			activities.push(item);
		});	
		if (!js.next) callback(err, activities);
		else {
			arg.uri = base+js.next;
			arg.activities = activities;
			getFitnessActs(arg, callback);
		}	
	});
}
