exports.user = {
  id: "id"
}

exports.message = {
  at: function(data) { return Date.parse(data.created_at); }
}

exports.defaults = {
  messages: 'message',
  users: 'contact',
  self: 'contact',
  groups: 'group'
}
