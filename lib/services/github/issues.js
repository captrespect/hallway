var async = require('async');
var request = require('request');
var _ = require('underscore');

exports.sync = function(pi, cb) {
  function getIssues(type) {
    // Return a function that takes a callback and returns the issues for the specified type
    return function(callback) {
      request.get({ url: "https://api.github.com/issues?access_token=" + pi.auth.accessToken + "&filter=" + type, json: true }, function(err, resp, body) {
        if (err || !body)
          return callback(err);

        callback(null, body);
      });
    };
  }

  async.series([
    getIssues('assigned'),
    getIssues('created'),
    getIssues('mentioned'),
    getIssues('subscribed')
  ],
  function(err, results) {
    if (err || !results)
      return cb(err);

    var base = 'issues:' + pi.auth.pid + '/issues';
    var data = {};

    data[base] = _.reduce(results, function(a, b) { return a.concat(b); }, []);

    cb(null, { data: data });
  });
};
