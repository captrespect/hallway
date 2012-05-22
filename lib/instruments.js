var lconfig = require("lconfig");
var stats = require("statsd-singly");

var host;
var port;

if (lconfig.statsd) {
  host = lconfig.statsd.host;
  port = lconfig.statsd.port;
}
var statsd = new stats.StatsD(host, port);
module.exports = statsd;
