exports.sync = require('./lib').genericSync(function(pi){
  // may need to support getting full history for self (if possible, not sure)
  return "people/~/network/updates?format=json&scope=self&count=250";
},function(pi, js, cb){
  // if none, reset to start for next run
  if (!js || !js.values) return cb(null, {});
  var data = {};
  data['update:'+pi.auth.pid+'/updates'] = js.values;
  cb(null, {data:data});
});
