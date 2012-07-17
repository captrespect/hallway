var crypto = require('crypto');
var url = require('url');
var fb = require('./lib.js');

function profilePhoto(id, size) {
  return fb.apiUrl(null, '/' + id + '/picture', {type: size || 'large'});
}

function extractLatLong(data) {
  var loc = data.place && data.place.location;
  if (loc && loc.latitude && loc.longitude) {
    return [loc.latitude, loc.longitude];
  }
}

function timestamp(data) {
  return (data.updated_time || data.created_time) * 1000;
}

exports.contact = {
  photo: function(data) {
    return profilePhoto(data.id);
  },
  gender: 'gender',
  nickname: 'username',
  at: timestamp,
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.url = data.link;
    ret.title = data.name;
    if(data.bio) ret.description = data.bio;
    ret.thumbnail_url = profilePhoto(data.id);
    ret.provider_name = 'facebook';
    return ret;
  },
  text: 'username'
};

// common pattern across many facebook objects
function participants(data) {
  var ret = {};
  if(data.from) ret[data.from.id] = {"author": true};
  if(data.to && Array.isArray(data.to.data)) {
    data.to.data.forEach(function(to) {
      ret[to.id] = ret[to.id] || {};
    });
  }
  if(data.likes && Array.isArray(data.likes.data)) {
    data.likes.data.forEach(function(like) {
      ret[like.id] = ret[like.id] || {};
    });
  }
  if(data.comments && Array.isArray(data.comments.data)) {
    data.comments.data.forEach(function(comment) {
      if(comment.from) ret[comment.from.id] = ret[comment.from.id] || {};
    });
  }
  return (Object.keys(ret).length > 0) ? ret : undefined;
}

var URL_REGEX = /((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;
exports.post = {
  at: timestamp,
  image: function(data) {
    return (data.type === 'photo' && data.picture) ?
             data.picture.replace('_s.','_o.') :
             undefined;
  },
  ll: extractLatLong,
  urls: function(data) {
    if(data.type === 'link' && data.link) return [data.link];

    // Cross-posted tweets show up as a plain status
    if (data.type !== 'status') return;
    if (!data.application || data.application.namespace !== 'twitter') return;

    var urls = {};
    var matchArray;
    if(data.message) {
      while((matchArray = URL_REGEX.exec(data.message)) !== null) {
        var str = matchArray[0];

        // Cleanup for url.parse
        if(str.substr(0,4).toLowerCase() !== "http") str = "http://" + str;
        if(str.indexOf('&quot') === str.length - 5) {
          str = str.substr(0, str.indexOf('&quot')); // Remove twitter escaping
        }

        // TODO: Fully normalize
        var uri = url.parse(str);
        if (!uri.host) continue;

        var dot = uri.host.indexOf(".");
        if(dot <= 0 || uri.host.length - dot < 3) continue;

        if(uri.hash === '#') uri.hash = ''; // Normalize empty fragment
        var canonical = url.format(uri);
        urls[canonical] = true;
      }
    }

    urls = Object.keys(urls);
    return urls.length > 0 ? urls : undefined;
  },
  oembed: function(data) {
    var ret = {
      type: data.type,
      provider_name: 'facebook'
    };
    if(data.from && data.from.name) ret.author_name = data.from.name;

    // TODO, add ret.html support for videos.
    // Will need to do link processing and fallback hard-coded
    // http://stackoverflow.com/questions/5752345/does-facebook-support-oembed
    if(data.type === 'link' || data.type === 'video') {
      ret.url = data.link;
      ret.description = data.description;
      ret.title = data.name;
      if(data.picture) ret.thumbnail_url = data.picture;
    }

    if(data.type === 'checkin') {
      ret.lat = data.place.location.latitude;
      ret.lng = data.place.location.longitude;
      ret.description = data.message;
      if(data.link) ret.url = data.link;
      ret.title = data.place.name;
    }

    return ret;
  },
  text: function(data) {
    if(data.message)     return data.message;
    if(data.description) return data.description;
    if(data.caption)     return data.caption;
    if(data.story)       return data.story;
    return undefined;
  },
  author: function(data) {
    if(!data.from) return undefined;
    var ret = {};
    ret.name = data.from.name;
    ret.url = 'http://facebook.com/' + data.from.id;
    ret.photo = profilePhoto(data.from.id);
    return ret;
  },
  participants: participants
};

exports.photo = {
  at: timestamp,
  oembed: function(data) {
    var ret = {
      type          : 'photo',
      title         : data.name,
      height        : data.height,
      width         : data.width,
      url           : data.source || data.picture,
      thumbnail_url : data.picture,
      provider_name : 'facebook',
      provider_url  : data.link
    };
    if (data.from && data.from.name) ret.author_name = data.from.name;
    return ret;
  },
  media: 'source',
  ll: extractLatLong,
  participants: participants
};

exports.album = {
  at: timestamp,
  text: 'name'
};

exports.url = {
  url: function(data) {
    return [data.url];
  },
  id: function(data) {
    return crypto.createHash('md5').update(data.url).digest('hex');
  }
};

exports.defaults = {
  friends       : 'contact',
  feed          : 'post',
  home          : 'post',
  home_photos   : 'photo',
  home_checkins : 'post',
  checkins      : 'post',
  photos        : 'photo',
  albums        : 'album',
  self          : 'contact',
  page_likes    : 'page',
  url_likes     : 'url',
  stream_likes  : 'post'
};

exports.types = {
  photos        : ['photo:facebook/photos'],
  photos_feed   : ['photo:facebook/home_photos'],
  news          : ['link:facebook/feed_self'],
  news_feed     : ['link:facebook/home', 'link:facebook/feed_others'],
  videos        : ['video:facebook/feed_self'],
  videos_feed   : ['video:facebook/home', 'video:facebook/feed_others'],
  checkins      : ['post:facebook/checkins'],
  checkins_feed : ['checkin:facebook/home'],
  statuses      : ['status:facebook/feed_self'],
  statuses_feed : ['status:facebook/home', 'status:facebook/feed_others'],
  contacts      : ['contact:facebook/friends']
};

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = {};
      var typeCount = Object.keys(entry.types).length;

      // Look for a type in the post's links
      if(entry.refs) {
        Object.keys(entry.refs).forEach(function(ref) {
          if(ref.indexOf(':links/oembed') === -1) return;
          var type = ref.substring(0, ref.indexOf(':'));
          if(type && type.length > 0) entry.types[type] = true;
        });
      }
      // One of the links was typed
      if(Object.keys(entry.types).length > typeCount) return;

      // Fall back to Facebook's type when it makes sense
      // TODO: Explain what's going on here
      // See https://github.com/Singly/hallway/issues/261
      if(entry.data.type) {
        if(entry.data.type !== 'status' ||
           entry.data.message           ||
           !entry.data.story            ||
           entry.data.story.indexOf('are now friends') === -1) {
          entry.types[entry.data.type] = true;
        }
      }
    }
  }
};

function instagramGUID(uri) {
  var match = /instagr.am\/p\/([^\/]+)/.exec(uri);
  if (match) return 'guid:instagram/#' + match[1];
}

function foursquareGUID(uri) {
  var match = /foursquare\.com\/[^\/]+\/checkin\/(\w+)/.exec(uri);
  if (match) return 'guid:foursquare/#' + match[1];
}

function twitterGUID(handle, message) {
  var guid = crypto.createHash('md5').update(message).digest('hex');
  return 'guid:' + handle + '@twitter/#' + guid;
}

exports.guid = {
  'photo': function(entry) {
    if(entry.data.name) return instagramGUID(entry.data.name);
  },
  'post': function(entry) {
    // These match tweets that were cross posted
    var refs = entry.refs ? Object.keys(entry.refs) : [];
    for(var i = 0; i < refs.length; i++) {
      var ref = refs[i];
      var id = instagramGUID(ref) || foursquareGUID(ref);
      if (id) return id;
    }

    // Twitter fallback to just a string
    if(entry.data.application && entry.data.application.name === 'Twitter')
    {
      var handle = '';
      // Lame heuristic to find the twitter handle but seems safest?
      if(entry.data.actions) {
        var match;
        entry.data.actions.forEach(function(action) {
          if((match = /\@(\S+) on Twitter/.exec(action.name))) {
            handle = match[1];
          }
        });
      }
      return twitterGUID(handle, entry.data.message);
    }

    // Foursquare catcher
    if(entry.data.application && entry.data.application.name === 'foursquare') {
      return foursquareGUID(entry.data.link);
    }

    return undefined;
  }
};
