exports.contact = {
  photo: function(data) {
      return 'https://graph.facebook.com/' + data.id + '/picture?type=large';
  },
  gender: 'gender',
  nickname: 'username',
  at: function(data) { return data.updated_time * 1000 },
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.url = data.link;
    ret.title = data.name;
    if(data.bio) ret.description = data.bio;
    ret.thumbnail_url = 'https://graph.facebook.com/' + data.id + '/picture?type=large';
    ret.provider_name = 'facebook';
    return ret;
  },
  text: 'bio'
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
      ret.provider_name = 'facebook';
      if(data.from && data.from.name) ret.author_name = data.from.name;
    }
    if(data.type == 'video')
    {
      ret = {type:data.type};
      ret.url = data.link;
      ret.description = data.description;
      ret.title = data.name;
      if(data.picture) ret.thumbnail_url = data.picture;
      // TODO, add ret.html support, will need to do link processing and fallback hard-coded like http://stackoverflow.com/questions/5752345/does-facebook-support-oembed
      ret.provider_name = 'facebook';
      if(data.from && data.from.name) ret.author_name = data.from.name;
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
    ret.provider_name = 'facebook';
    ret.provider_url = data.link;
    if(data.from && data.from.name) ret.author_name = data.from.name;
    ret
    return ret;
  },
  media: 'source',
  ll: function(data) {
    return (data.place && data.place.location && data.place.location.latitude && data.place.location.longitude) ? [data.place.location.latitude, data.place.location.longitude] : undefined;
  }
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
  statuses_feed: ['status:facebook/home'],
  contacts: ['contact:facebook/friends']
}

exports.pumps = {
  types: {
    contact: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.username) entry.types.contact = entry.data.username;
    },
    post: function(entry) {
      if(!entry.types) entry.types = {};
      var pre = Object.keys(entry.types).length;
      if(entry.refs) Object.keys(entry.refs).forEach(function(ref){
        if(ref.indexOf(':links/oembed') == -1) return;
        var type = ref.substring(0, ref.indexOf(':'));
        var id = ref.substring(ref.indexOf('#')+1);
        if(type && type.length > 0) entry.types[type] = id; // substrate type
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

var crypto = require('crypto');
exports.guid = {
  'photo': function(entry) {
    if(!entry.data.name) return undefined;
    var match;
    // match instagrammys
    if((match = /instagr.am\/p\/([^\/]+)\//.exec( entry.data.name ))) return 'guid:instagram/#'+match[1];
    return undefined;
  },
  'post': function(entry) {
    var match;

    // these match tweets that were cross posted (oh, the irony!)
    var refs = entry.refs ? Object.keys(entry.refs) : [];
    for(var i = 0; i < refs.length; i++)
    {
      var ref = refs[i];
      // match instagrammys
      if((match = /instagr.am\/p\/([^\/]+)\//.exec( ref ))) return 'guid:instagram/#'+match[1];
      // match checkins
      if((match = /foursquare\.com\/[^\/]+\/checkin\/(\w+)/.exec( ref ))) return 'guid:foursquare/#'+match[1];
      
    }

    // twitter fallback to just a string
    if(entry.data.application && entry.data.application.name == 'Twitter')
    {
      // get the twitter handle
      var handle = '';
      // lame heuristic to find the twitter handle but seems safest?
      if(entry.data.actions) entry.data.actions.forEach(function(action){ if((match = /\@(\S+) on Twitter/.exec(action.name))) handle = match[1] });
      // gen a guid from twitter's text
      return 'guid:'+handle+'@twitter/#'+crypto.createHash('md5').update(entry.data.message).digest('hex');
    }

    // foursquare catcher
    if(entry.data.application && entry.data.application.name == 'foursquare' && (match = /foursquare\.com\/[^\/]+\/checkin\/(\w+)/.exec( entry.data.link )))
    {
      return 'guid:foursquare/#'+match[1];
    }
    return undefined;
  }
}