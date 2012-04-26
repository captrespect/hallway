exports.contact = {
  photo: function(data) {
      return 'https://graph.facebook.com/' + data.id + '/picture';
  },
  gender: 'gender',
  nickname: 'username',
  at: function(data) { return data.updated_time * 1000 }
};

exports.post = {
  at: function(data) { return data.updated_time * 1000 }  
}

exports.photo = {
  at: function(data) { return data.updated_time * 1000 }  
}

exports.defaults = {
  friends: 'contact',
  feed: 'post',
  home: 'post',
  photos: 'photo',
  self: 'contact'
}
