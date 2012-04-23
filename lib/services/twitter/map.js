exports.contact = {
    photo: 'profile_image_url',
    address: {
        type:'location',
        key:'location'
    },
    nickname: 'screen_name'
};

exports.tweet = {
    id: 'id_str',
    fromName: '',
    fromId: ''
};

exports.related = {
    id: '_id'
};

exports.defaults = {
  friends: 'contact',
  timeline: 'tweet',
  mentions: 'tweet',
  tweets: 'tweet',
  self: 'contact'
}
