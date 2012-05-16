exports.sync = require('./lib').genericSync(function(pi){
  if (!pi.config.connStart) {
    pi.config.connStart = 0;
    return "people/~/connections?format=json";
  } else {
    return "people/~/connections?start=" + pi.config.connStart + "&format=json";
  }
},function(pi, js, cb){
  // if none, reset to start for next run
  if (!js || !js.values) return cb(null, {config:{connStart:0}});
  // only bump it up if more than default amount (500)
  if (js.values.length < 500) {
    pi.config.connStart = 0;
  } else {
    pi.config.connStart += 500;
  }
  var base = 'profile:'+pi.auth.pid+'/connections';
  var data = {};
  data[base] = js.values;
  cb(null, {data:data, config:{connStart:pi.config.connStart}});
});
