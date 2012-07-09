exports.contact = {
  id: "id",
  photo: "mugshot_url",
  nickname: 'name',
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.url = data.web_url;
    ret.description = data.summary;
    ret.thumbnail_url = data.mugshot_url;
    ret.provider_name = 'yammer';
    return ret;
  },
  text: 'full_name'
}



exports.message = {
  at: function(data) { return Date.parse(data.created_at); },
  text: function(data) { return data.body.plain; }
}

exports.defaults = {
  messages: 'message',
  users: 'contact',
  self: 'contact',
  groups: 'group'
}

exports.types = {
  statuses_feed: ['message:yammer/messages'],
  contacts: ['contact:yammer/users']
}
