var fs = require("fs");
var ig = require("./lib.js");
var me = JSON.parse(fs.readFileSync(process.argv[2]));
ig.getSelf(me,function(js){  console.log("ME\t"+JSON.stringify(js)); me=js}, function(err){ if(err) console.log("error: "+err); } );
//ig.getMedia({},function(js){  console.log("PHOTO\t"+JSON.stringify(js));}, function(err){ if(err) console.log("error: "+err);});
//ig.getFollows({},function(js){  console.log("FRIEND\t"+JSON.stringify(js));}, function(err){ if(err) console.log("error: "+err);});
//ig.getFeed({},function(js){  console.log("FEED\t"+JSON.stringify(js));}, function(err){ if(err) console.log("error: "+err);});


var posts = require(process.argv[3]);
posts.sync({auth:me.auth,config:{}},function(e,js){
    console.error("got e:"+e);
    console.error("got js:"+JSON.stringify(js));
});
