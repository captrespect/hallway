var pageSize = 200;

var request = require('request');
var url = require('url');
var util = require('util');


exports.getData = function(arg, callback){
	var runkeep = this;
	var data = arg.data || [];
	var base = 'http://api.runkeeper.com/';
	if(!arg.uri) uri = base+arg.query+'?pageSize='+pageSize+'&modifiedNoEarlierThan=' + arg.since;
	else uri = arg.uri;
	request.get({url:url.parse(uri), headers:{'Content-type': 'application/vnd.com.runkeeper.'+arg.type+'+json', 'Host':'api.runkeeper.com', 'Authorization': 'Bearer '+arg.token, 'Accept':'application/vnd.com.runkeeper.'+arg.type+'+json'}, json:true}, function (err, resp, js){
		if(err) return callback(err);
		if(resp.statusCode != 200) return callback(new Error("status code "+resp.statusCode+" "+util.inspect(js)));
		if(!js) return callback(new Error("missing js: "+util.inspect(js)));
		if(!js.items) js.items = js;
		js.items.forEach(function(item){
			data.push(item);
		});	
		if (!js.next) {
			callback(err, data);
		}	
		else {
			arg.uri = base+js.next;
			arg.data = data;
			runkeep.getData(arg, callback);
		}	
	});
};
