var mysql = require("mysql-libmysqlclient");
var logger = require("logger").logger("dal-mysqlclient");
var lconfig = require("lconfig"); // TODO: I don't like this here, I want this more generic, fix later

exports.debug = lconfig.debug;

var active = 0;
exports.create = function(config, callback) {
  var client = new Db(mysql.createConnectionSync(), mysql.createConnectionSync());

  var options = { };
  if (!config) config = { };
  if (config.hostname) options.host = config.hostname;
  if (config.port) options.port = config.port;
  if (config.username) options.user = config.username;
  if (config.password) options.password = config.password;
  if (config.database) options.database = config.database;
  if (config.slavehostname) options.slavehost = config.slavehostname;
  logger.debug("connecting",++active);
  client.connect(options, callback);
}

exports.destroy = function(thingy)
{
  logger.debug("disconnecting",--active);
  if(thingy && thingy.client && thingy.client.connectedSync()) thingy.client.closeSync();
  if(thingy && thingy.slave && thingy.slave.connectedSync()) thingy.slave.closeSync();
}

function Db(client, slave) {
  this.client = client;
  this.slave = slave;
}
Db.prototype.query = function(sql, binds, cbDone) {
  if (!cbDone) {
    cbDone = function() {};
  }

  var self = this;
  if (binds && binds.length > 0) {
    sql = sql.replace(/\?/g, function() {
      var arg = binds.shift();
      if(arg === undefined) {
        logger.error("invalid number of binds",sql,binds);
        return "''";
      }
      if(arg === null) return 'NULL';
      return "'" + self.client.escapeSync(arg.toString()) + "'";
    });
  }
  if (exports.debug) logger.debug(">> mysql: %s", sql);
  var client = (sql.toLowerCase().indexOf("select") == 0 && sql.toLowerCase().indexOf("from ijod") > 0 && this.slave.connectedSync()) ? this.slave : this.client;
  client.query(sql, function(error, res) {
    if (exports.debug) logger.debug("<< mysql: %s", sql);
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
  this.client.connect(options.host, options.user, options.password, options.database, options.port, function(error) {
    if(error || !options.slavehost) return cbDone(error, self);
    self.slave.connect(options.slavehost, options.user, options.password, options.database, function(error) {
      cbDone(error, self);
    });
  });
};

