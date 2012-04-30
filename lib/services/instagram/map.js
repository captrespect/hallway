exports.contact = {
  name: 'full_name',
  photo: 'profile_picture',
  nickname: 'username'
};

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
