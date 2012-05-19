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
  contacts: ['contact:instagram/follows']
}
