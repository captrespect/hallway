
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
    ret.provider_name = 'github';
    return ret;
  },
  text: 'email'
}

exports.event = {
  at: function(data) { return Date.parse(data.created_at) },
  text: function(data) {
    var txt = [];
    if(!data.payload) return undefined;
    if(data.type == "IssueCommentEvent" && data.payload.comment) txt.push(data.payload.comment.body);
    if(data.type == "IssuesEvent" && data.payload.issue) { txt.push(data.payload.issue.title); txt.push(data.payload.issue.body) };
    if(data.type == "PushEvent" && data.payload.commits) data.payload.commits.forEach(function(commit){ txt.push(commit.message) });
    if(txt.length == 0) return undefined;
    return txt.join(" ");
  },
  author: function(data) {
    if(!data.actor) return undefined;
    var ret = {};
    ret.name =  data.actor.login;
    ret.url = 'https://github.com/'+data.actor.login;
    ret.photo = data.actor.avatar_url;
    return ret;
  }
}

exports.repo = {
  text: function(data) { return [data.name, data.description].join(" ") }
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
