var request = require('request');

exports.sync = function(pi, cb) {
  function getIssues(type) {
    request.get({ url:"https://api.github.com/issues?access_token=" + pi.auth.accessToken + "&filter=" + type, json:true }, function(err, resp, body) {
      if(err || !body) return cb(err);
      var base = 'issues:' + pi.auth.pid + '/issues';
      var data = {};
      data[base] = body;
      cb(null, {data: data});
    });
  }

  getIssues('assigned');
  getIssues('created');
  getIssues('mentioned');
  getIssues('subscribed');
};
