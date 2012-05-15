exports.device = {
  at: function(data) { return (new Date(data.lastSyncTime)).getTime() }
}

exports.profile = {
  id: 'encodedId',
  photo: 'avatar'
}

exports.defaults = {
  devices: 'device',
  activities: 'activity',
  self: 'profile'
}

