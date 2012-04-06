var lconfig = require('lconfig');
var fs = require('fs');

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

module.exports = apikeys;
console.log(apikeys);