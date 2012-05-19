exports.contact = {
  name: function(data) {
      return data.firstName + (data.lastName? ' ' + data.lastName: '');
  },
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.url = data.canonicalUrl;
    ret.title = data.firstName + ' ' + data.lastName;
    if(data.bio) ret.description = data.bio;
    ret.thumbnail_url = data.photo;
    return ret;
  }
};

exports.checkin = {
  at: function(data) { return data.createdAt * 1000 },
  ll: function(data) {
    var loc = data.venue ? data.venue.location : data.location; // venueless happens
    return (loc && loc.lat && loc.lng) ? [loc.lat, loc.lng] : undefined;
  },
  oembed: function(data) {
    // only oembed venues
    if(!data.venue || !data.venue.location) return undefined;
    var ret = {type:'checkin'};
    ret.lat = data.venue.location.lat;
    ret.lng = data.venue.location.lng;
    ret.title = data.venue.name;
    ret.url = data.url;
    return ret;
  }
}

exports.photo = {
  at: function(data) { return data.createdAt * 1000 },
  oembed: function(data) {
    var ret = {type:'photo'};
    if(data.checkin && data.checkin.about) ret.title = data.checkin.about;
    if(!ret.title && data.venue && data.venue.name) ret.title = data.venue.name;
    ret.height = data.sizes.items[0].height;
    ret.width = data.sizes.items[0].width;
    ret.url = data.url;
    return ret;
  }
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
  photos: ['photo:foursquare/photos'],
  photos_feed: ['photo:foursquare/recent'],
  checkins: ['checkin:foursquare/checkins'],
  checkins_feed: ['checkin:foursquare/recent'],
  contacts: ['contact:foursquare/friends']
}

exports.pumps = {
  types: {
    contact: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.contact && entry.data.contact.email) entry.types.contact = entry.data.contact.email;
    }
  }
}