exports.contact = {
  name: function(data) {
      return data.firstName + (data.lastName? ' ' + data.lastName: '');
  },
  gender: 'gender',
  email : 'contact.email',
  phoneNumber : {
      key: 'contact.phone',
      type: 'mobile'
  },
  address: {
      type: 'location',
      key: 'homeCity'
  },
  or: {
      'accounts.twitter.data.screen_name':'contact.twitter',
      'accounts.facebook.data.id':'contact.facebook'
  }
};

exports.checkin = {
  at: function(data) { return data.createdAt * 1000 }  
}

exports.photo = {
  at: function(data) { return data.createdAt * 1000 }  
}

exports.defaults = {
  friends: 'contact',
  recent: 'checkin',
  checkins: 'checkin',
  photos: 'photo',
  badges: 'badge',
  self: 'contact'
}

exports.types = {
  photos: ['photo:foursquare/photos']
}
