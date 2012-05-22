
var ent = require('ent');
function strip(html)
{
  if(!html) return html;
  return ent.decode(html.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " "));
}

exports.user = {
  photo: "avatar_url",
  at: function(data) { return Date.parse(data.created_at) },
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.title = data.name;
    if(data.bio && data.bio.length > 0) ret.description = strip(data.bio);
    if(data.email) ret.email = data.email;
    if(data.avatar_url) ret.thumbnail_url = data.avatar_url;
    ret.url = data.html_url;
    return ret;
  }
}

exports.defaults = {
  self: 'user',
  events: 'event',
  received: 'event',
  repos: 'repo',
  following: 'user',
  followers: 'user'
}

exports.types = {
  contacts: ['user:github/following']
}
