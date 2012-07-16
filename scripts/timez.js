var request = require('request');
var idr = require(__dirname+'/../lib/idr.js');

var url = process.argv[2];
request.get({url:url, json:true}, function(e,r,js){
  var timez = {};
  var oldest = Date.now();
  js.forEach(function(entry){
    var r = idr.parse(entry.idr);
    if(!timez[r.host]) timez[r.host] = [];
    timez[r.host].push(entry.at);
    if(entry.at < oldest) oldest = entry.at;
  });

  var now = Date.now();
  Object.keys(timez).forEach(function(service){
    timez[service].sort();
    console.log(service,timez[service].length,t(now-timez[service][0]),t(now-timez[service][timez[service].length-1]));
  });
  console.log(oldest, t(now-oldest));

});

function t(x) { return parseInt(x/1000) }
