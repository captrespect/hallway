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
    if(data.type == 'link' && data.link) return [data.link];
    // cross-posted tweets show up as a plain status, lameo
    if(data.type != 'status' || !data.application || data.application.namespace != 'twitter') return undefined;
    var url = require('url');
    var urls = {};
    var regexToken = /((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;
    var matchArray;
    if(data.message) while( (matchArray = regexToken.exec( data.message )) !== null )
    {
        var str = matchArray[0];
        // gotta do sanity cleanup for url.parse, it makes no assumptions I guess :/
        if(str.substr(0,4).toLowerCase() != "http") str = "http://"+str;
        if(str.indexOf('&quot') == str.length - 5) str = str.substr(0, str.indexOf('&quot')); // stupid twitter escaping
        var u = url.parse(str);
        if(!u.host || u.host.indexOf(".") <= 0 || u.host.length - u.host.indexOf(".") < 3) continue; // TODO: fully normalize
        if(u.hash === '#') u.hash = ''; // empty hash is nothing, normalize that by a pound
        var uf = url.format(u);
        urls[uf] = true;
    }
    urls = Object.keys(urls);
    return urls.length > 0 ? urls : undefined;
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
    if(data.type == 'video')
    {
      ret = {type:data.type};
      ret.url = data.link;
      ret.description = data.description;
      ret.title = data.name;
      if(data.picture) ret.thumbnail_url = data.picture;
      // TODO, add ret.html support, will need to do link processing and fallback hard-coded like http://stackoverflow.com/questions/5752345/does-facebook-support-oembed
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
  videos: ['video:facebook/feed'],
  videos_feed: ['video:facebook/home'],
  statuses: ['status:facebook/feed'],
  statuses_feed: ['status:facebook/home']
}

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = {};
      var pre = Object.keys(entry.types).length;
      if(entry.refs) Object.keys(entry.refs).forEach(function(ref){
        if(ref.indexOf(':links/oembed') == -1) return;
        var type = ref.substring(0, ref.indexOf(':'));
        if(type && type.length > 0) entry.types[type] = true; // substrate type
      });
      // when a link was typed, that trumps all
      if(Object.keys(entry.types).length > pre) return;
      // fallback to facebooks type when it makes sense
      if(entry.data.type) {
        // see https://github.com/Singly/hallway/issues/261
        if(entry.data.type != 'status' || entry.data.message || !entry.data.story || entry.data.story.indexOf('are now friends') == -1)
          entry.types[entry.data.type] = true;
      }
    }
  }
}
