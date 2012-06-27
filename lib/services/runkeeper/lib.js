var pageSize = 200;

var request = require('request');
var url = require('url');


exports.getActivities = function(arg, callback){
	var runkeep = this;
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
			runkeep.getActivities(arg, callback);
		}	
	});
};
