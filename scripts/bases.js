var dMap = require("dMap.js")
var idr = require('idr');
console.log(dMap.bases([process.argv[2]]).map(function(key){return idr.baseHash(key)+" "+key}));
