exports.device = {
  at: function(data) {
    return (new Date(data.lastSyncTime)).getTime();
  }
};

exports.profile = {
  id: 'encodedId',
  photo: 'avatar'
};

exports.defaults = {
  self       : 'profile',
  activities : 'activity',
  devices    : 'device',
  fat        : 'fat',
  sleep      : 'sleep',
  weight     : 'weight'
};

