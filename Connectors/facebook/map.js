exports.contact = {
  photo: function(data) {
      return 'https://graph.facebook.com/' + data.id + '/picture';
  },
  gender: 'gender',
  nickname: 'username'
};

exports.defaults = {
  friends: 'contact',
  feed: 'post',
  home: 'post',
  photos: 'photo',
  self: 'contact'
}
