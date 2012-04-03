var mysql = require("mysql");

exports.create = function(config, callback) {
  var options = { };
  if (config.hostname) options.host = config.hostname;
  if (config.port) options.port = config.port;
  if (config.username) options.user = config.username;
  if (config.password) options.password = config.password;
  if (config.database) options.database = config.database;

  try {
    callback(null, mysql.createClient(options));
  } catch (E) {
    callback(E);
  }
}
