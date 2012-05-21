var lconfig = require("lconfig");
var statsd;
if (lconfig.statsd) {
  statsd = require("singly-statsd").StatsD(lconfig.statsd.host, lconfig.statsd.port);
}
module.exports = statsd;
