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
  oembed: function(data) {
    var ret;
    if(data.type == 'link')
    {
      ret = {type:data.type};
      ret.url = data.link;
      ret.description = data.description;
      ret.title = data.name;
      if(data.picture) ret.thumbnail_url = data.picture;
    }
    return ret;
  },
  text: function(data) {
    if(data.message) return data.message;
    if(data.description) return data.description;
    if(data.caption) return data.caption;
    if(data.story) return data.story;
    return undefined;
  }
}

exports.photo = {
  at: function(data) { return data.updated_time * 1000 },
  oembed: function(data) {
    var ret = {type:'photo'};
    ret.height = data.height;
    ret.width = data.width;
    ret.url = data.picture;
    return ret;
  },
  media: 'source'
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
  photos_feed: ['photo:facebook/home_photos'],
  news: ['link:facebook/feed'],
  news_feed: ['link:facebook/home'],
  statuses: ['status:facebook/feed'],
  statuses_feed: ['status:facebook/home']
}

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.type) entry.types[entry.data.type] = true;
      if(entry.refs) Object.keys(entry.refs).forEach(function(ref){
        if(ref.indexOf(':links/oembed') == -1) return;
        var type = ref.substring(0, ref.indexOf(':'));
        if(type && type.length > 0) entry.types['link'+type] = true; // substrate type
      });
    }
  }
}
