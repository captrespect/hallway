exports.contact = {
  photo: function(data) {
      return 'https://graph.facebook.com/' + data.id + '/picture?type=large';
  },
  gender: 'gender',
  nickname: 'username',
  at: function(data) { return data.updated_time * 1000 }
};

exports.post = {
  at: function(data) { return data.updated_time * 1000 },
  image: function(data) { return (data.type == 'photo' && data.picture) ? data.picture.replace('_s.','_o.') : undefined }
}

exports.photo = {
  at: function(data) { return data.updated_time * 1000 }  
}

exports.album = {
  at: function(data) { return data.updated_time * 1000 }  
}

exports.defaults = {
  friends: 'contact',
  feed: 'post',
  home: 'post',
  home_photos: 'photo',
  photos: 'photo',
  albums: 'album',
  self: 'contact'
}

exports.types = {
  photos: ['photo:facebook/photos'],
  photos_feed: ['photo:facebook/home_photos']
}
