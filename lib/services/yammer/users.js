var request = require("request");

exports.sync = function(pi, cb) {
  var arg = {};
  arg.users = [];
  arg.url = "https://www.yammer.com/api/v1/users.json?access_token=" + pi.auth.token.access_token.token;

  if (pi.config.pagingUsers === true) {
    arg.url += "&page=" + pi.config.userPage;
  }
  else {
    pi.config.userPage = 1;
  }

  page(arg, pi, function(err) {
    if (pi.config.pagingUsers) {
      // schedule run 30 seconds from now to conform to yammer's guidelines
      pi.config.nextRun = Date.now() + 30*1000;
    }
    var data = {};
    data['contact:'+pi.auth.pid+'/users'] = arg.users;
    cb(err, {data : data, config : pi.config});
  });
};

function page(arg, pi, callback)
{
  request.get({uri: arg.url, json: true}, function(err, resp, users) {
    if (err || !users || !Array.isArray(users) || users.length === 0) {
      // Receiving 0 users can happen when done paging back
      pi.config.pagingUsers = false;
      return callback(err);
    }

    // some users were found
    arg.users = users;
    pi.config.pagingUsers = true;
    pi.config.userPage++;
    callback();
  });
}
