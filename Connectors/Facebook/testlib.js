var fs = require("fs");
var util = require('util');
var fb = require("./lib.js");
var pi = JSON.parse(fs.readFileSync(process.argv[3]));
//console.log("passing auth: "+JSON.stringify(pi));

if(process.argv[4]) pi.config = JSON.parse(process.argv[4]);
var sync = require(process.argv[2]);
sync.sync(pi,function(e,js){
    console.error("error:"+util.inspect(e));
    console.error("config: "+JSON.stringify(js.config));
    Object.keys(js.data).forEach(function(key){console.error(key+"\t"+js.data[key].length)});
});
