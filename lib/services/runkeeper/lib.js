var PAGE_SIZE = 200;
var BASE = 'http://api.runkeeper.com/';

var request = require('request');
var url = require('url');
var util = require('util');


exports.getData = function(arg, callback){
	var runkeep = this;
	var data = arg.data || [];
	if(!arg.uri) uri = BASE+arg.query+'?pageSize='+PAGE_SIZE+'&modifiedNoEarlierThan=' + arg.since;
	else uri = arg.uri;
	request.get({url:url.parse(uri), headers:{'Content-type': 'application/vnd.com.runkeeper.'+arg.type+'+json', 'Host':'api.runkeeper.com', 'Authorization': 'Bearer '+arg.token, 'Accept':'application/vnd.com.runkeeper.'+arg.type+'+json'}, json:true}, function (err, resp, json){
		if(err) return callback(err);
		if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(json)));
		if(!json) return callback(new Error("missing json: "+util.inspect(json)));
		if(!json.items) json.items = json;
		json.items.forEach(function(item){
			data.push(item);
		});	
		if (!json.next) {
			callback(err, data);
		}	
		else {
			arg.uri = BASE+json.next;
			arg.data = data;
			runkeep.getData(arg, callback);
		}	
	});
};
