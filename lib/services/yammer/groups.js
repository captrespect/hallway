var request = require("request");

exports.sync = function(pi, cb) {
  var arg = {};
  arg.groups = [];
  arg.url = "https://www.yammer.com/api/v1/groups.json?access_token=" + pi.auth.token.access_token.token;

  if (pi.config.pagingGroups === true) {
    arg.url += "&page=" + pi.config.groupsPage;
  }
  else {
    pi.config.groupsPage = 1;
  }

  page(arg, pi, function(err) {
    if (pi.config.pagingGroups) {
      // schedule run 30 seconds from now to conform to yammer's guidelines
      pi.config.nextRun = Date.now() + 30*1000;
    }
    var data = {};
    data['group:'+pi.auth.pid+'/groups'] = arg.groups;
    cb(err, {data : data, config : pi.config});
  });
};

function page(arg, pi, callback)
{
  request.get({uri: arg.url, json: true}, function(err, resp, groups) {
    if (err || !groups || !Array.isArray(groups) || groups.length === 0) {
      // Receiving 0 groups can happen when done paging back
      pi.config.pagingGroups = false;
      return callback(err);
    }
    // some groups were found
    arg.groups = groups;
    pi.config.pagingGroups = true;
    pi.config.groupsPage++;
    callback();
  });
}
