var fs = require("fs");
var fb = require("./lib.js");
var pi = JSON.parse(fs.readFileSync(process.argv[3]));
console.log("passing auth: "+JSON.stringify(pi));

var sync = require(process.argv[2]);
sync.sync(pi,function(e,js){
    console.error(e);
    console.error("got js:"+JSON.stringify(js));
});
