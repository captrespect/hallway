var mysql = require("mysql-libmysqlclient");
var logger = require("logger").logger("dal-mysqlclient");

exports.debug = false;

exports.create = function(config, callback) {
  var client = new Db(mysql.createConnectionSync());

  var options = { };
  if (config && config.hostname) options.host = config.hostname;
  if (config && config.port) options.port = config.port;
  if (config && config.username) options.user = config.username;
  if (config && config.password) options.password = config.password;
  if (config && config.database) options.database = config.database;

  client.connect(options, callback);
}

function Db(client) {
  this.client = client;
}
Db.prototype.query = function(sql, binds, cbDone) {
  if (!cbDone) {
    cbDone = function() {};
  }

  var self = this;
  if (binds && binds.length > 0) {
    sql = sql.replace(/\?/g, function() {
      var arg = binds.shift();
      if(!arg) {
        logger.error("invalid number of binds",sql,binds);
        return "''";
      }
      return "'" + self.client.escapeSync(arg.toString()) + "'";
    });
  }
  if (exports.debug) logger.debug(sql);
  this.client.query(sql, function(error, res) {
    if (error) return cbDone(new Error(error));
    if (res.hasOwnProperty("affectedRows")) {
      return cbDone(null, []);
    }
    res.fetchAll(cbDone);
  });
  return {sql:sql};
};
Db.prototype.connect = function(options, cbDone) {
  var self = this;
  this.client.connect(options.host, options.user, options.password, options.database, function(error) {
    cbDone(error, self);
  });
};
