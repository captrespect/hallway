exports.contact = {
  name: 'full_name',
  photo: 'profile_picture',
  nickname: 'username'
};

exports.photo = {
  at: function(data) { return data.created_time * 1000 },
  ll: function(data) {
    return (data.location && data.location.latitude && data.location.longitude) ? [data.location.latitude, data.location.longitude] : undefined;
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
  photos_feed: ['photo:instagram/feed']
}
