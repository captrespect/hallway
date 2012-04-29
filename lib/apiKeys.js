var lconfig = require('lconfig');
var fs = require('fs');
var acl = require('acl');

var apikeys;
if(lconfig.apikeysPath) {
  apikeys = JSON.parse(fs.readFileSync(lconfig.apikeysPath));
} else {
  apikeys = {};
  for(var envVarName in process.env) {
    if(envVarName.indexOf('API_KEY_') === 0) {
      var service_type = envVarName.substring(8);
      var endOfServiceName = service_type.indexOf('_');
      var service = service_type.substring(0, endOfServiceName);
      var keyType = service_type.substring(endOfServiceName + 1);
      if(!apikeys[service]) apikeys[service] = {};
      apikeys[service][keyType] = process.env[envVarName];
    }
  }
}

// return api keys from an app or globally for a given service
module.exports = function(service, appID, callback) {
  if(!appID) return apikeys[service];
  acl.getApp(appID, function(err, app){
    if(err) logger.error(err);
    if(app && app.apikeys && app.apikeys[service]) return app.apikeys[service];
    // fallback
    return apikeys[service];
  });
}