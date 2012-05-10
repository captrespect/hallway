exports.sync = require('./lib').genericSync(function(pi){
  // need to optimize this into two synclets, track updates, timestamps, etc
  return "people/~/network/updates?format=json&count=250";
},function(pi, js, cb){
  // if none, reset to start for next run
  if (!js || !js.values) return cb(null, {});
  var data = {};
  data['update:'+pi.auth.pid+'/network'] = js.values;
  cb(null, {data:data});
});
