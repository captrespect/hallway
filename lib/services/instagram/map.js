exports.contact = {
  name: 'full_name',
  photo: 'profile_picture',
  nickname: 'username',
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.url = (data.website && data.website.length > 0) ? data.website : 'http://listagr.am/n/'+data.username;
    ret.title = data.full_name;
    if(data.bio && data.bio.length > 0) ret.description = data.bio;
    ret.thumbnail_url = data.profile_picture;
    ret.provider_name = 'instagram';
    return ret;
  }
};

exports.photo = {
  at: function(data) { return data.created_time * 1000 },
  ll: function(data) {
    return (data.location && data.location.latitude && data.location.longitude) ? [data.location.latitude, data.location.longitude] : undefined;
  },
  oembed: function(data) {
    var ret = {type:'photo'};
    if(data.caption) ret.title = data.caption.text;
    ret.height = data.images.standard_resolution.height;
    ret.width = data.images.standard_resolution.width;
    ret.url = data.images.standard_resolution.url;
    ret.provider_name = 'instagram';
    if(data.link) ret.provider_url = data.link;
    if(data.user && data.user.full_name) ret.author_name = data.user.full_name;
    return ret;
  }
}

exports.checkin = {
  oembed: function(data) {
    if(!data.location || !data.location.id) return undefined;
    var ret = {type:'checkin'};
    ret.lat = data.location.latitude;
    ret.lng = data.location.longitude;
    ret.title = data.location.name;
    ret.url = data.link;
    ret.provider_name = 'instagram';
    if(data.user && data.user.full_name) ret.author_name = data.user.full_name;
    return ret;
  }
}

exports.defaults = {
  follows: 'contact',
  feed: 'photo',
  media: 'photo',
  self: 'contact'
}

exports.types = {
  photos: ['photo:instagram/media'],
  photos_feed: ['photo:instagram/feed'],
  contacts: ['contact:instagram/follows'],
  checkins: ['checkin:instagram/media'],
  checkins_feed: ['checkin:instagram/feed']
}

exports.pumps = {
  types: {
    photo: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.location && entry.data.location.id) entry.types.checkin = true;
    }
  }
}

exports.guid = {
  'photo': function(entry) {
    if(!entry.data.link) return undefined;
    var match;
    if((match = /instagr.am\/p\/([^\/]+)\//.exec( entry.data.link ))) return 'guid:instagram/#'+match[1];
    return undefined;
  }
}