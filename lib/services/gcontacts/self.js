
exports.sync = function(pi, callback) {
  var params = {'max-results':0};
  getClient(pi.auth).getFeed('https://www.google.com/m8/feeds/contacts/default/full', params, function(err, result) {
    if(!(result && result.feed) || err || result.error) {
      console.error('google contacts BARF! err=', err, ', result=', result);
      return callback(err);
    }
    pi.auth.profile = result.feed; // all we have for a profile is the top level stuff
    pi.auth.pid = encodeURIComponent(result.feed.id.$t)+'@gcontacts'; // profile id
    var base = 'profile:'+pi.auth.pid+'/self';
    var data = {};
    data[base] = [result.feed];
    callback(null, {auth:pi.auth, data:data});
  });
}

function getClient(auth) {
  var gdataClient = require('gdata-js')(auth.appKey || auth.clientID, auth.appSecret || auth.clientSecret, auth.redirectURI);
  gdataClient.setToken(auth.token);
  return gdataClient;
}
