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
  image: function(data) { return (data.type == 'photo' && data.picture) ? data.picture.replace('_s.','_o.') : undefined },
  ll: function(data) {
    // posts actually have places sometimes! http://jeremie.com/i/fd4979fc6afb8ba95a6e325de4c6c794.png
    return (data.place && data.place.location && data.place.location.latitude && data.place.location.longitude) ? [data.place.location.latitude, data.place.location.longitude] : undefined;
  },
  urls: function(data) {
    return (data.type == 'link' && data.link) ? [data.link] : undefined;
  },
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

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = [];
      if(entry.data.type) entry.types.push(entry.data.type);
      if(entry.refs) entry.refs.forEach(function(ref){
        if(ref.indexOf('link:links/') == -1) return;
        var type = ref.substring(ref.indexOf('/')+1, ref.indexOf('#'));
        if(type && type.length > 0) entry.types.push('link'+type); // substrate type
      });
    }
  }
}