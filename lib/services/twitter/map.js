exports.contact = {
    photo: function(data) {
        return data.profile_image_url_https ? data.profile_image_url_https.replace('_normal','') : undefined;
    },
    address: {
        type:'location',
        key:'location'
    },
    nickname: 'screen_name',
    at: function(data) { return new Date(data.created_at).getTime() }
};

exports.tweet = {
    id: 'id_str',
    fromName: '',
    fromId: '',
    at: function(data) { return new Date(data.created_at).getTime() },
    ll: function(data) {
      // hack to inspect until we find any [123,456]
      function firstLL(o, reversed) {
          if (Array.isArray(o) && o.length == 2 &&
              typeof o[0] == 'number' && typeof o[1] == 'number') {
              return (reversed) ? [o[1],o[0]] : o; // reverse them optionally
          }
          if (typeof o != 'object') return null;
          for (var i in o) {
              var ret = firstLL(o[i], reversed);
              if(ret) return ret;
          }
          return null;
      }

      // Find center of bounding boxed LL array
      function computedLL(box) {
          var allLat = 0;
          var allLng = 0;

          for (var i=0; i<box.length; ++i) {
              allLat += box[i][1];
              allLng += box[i][0];
          }
          var lat = +(allLat / 4).toFixed(5);
          var lng = +(allLng / 4).toFixed(5);

          return [lat, lng];
      }
      return firstLL(data.geo) || firstLL(data.coordinates, true) || (data.place !== null && data.place.hasOwnProperty('bounding_box') && computedLL(data.place.bounding_box.coordinates[0]));
      
    },
    urls: function(data) {
      var url = require('url');
      var urls = {};
      var ignores = {};
      // process twitter's defeind urls first
      if(data.entities && Array.isArray(data.entities.urls)) data.entities.urls.forEach(function(u){
        urls[u.expanded_url || u.url] = true;
        if(u.expanded_url != u.url) ignores[u.url] = true; // if there's an expanded and it's different, that's the better one, ignore the shorter (t.co) one
      });
      var regexToken = /((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;
      // when you use /g on a regex it magically maintains state between .exec() calls, CRAZY TIMES!
      var matchArray;
      if(data.text) while( (matchArray = regexToken.exec( data.text )) !== null )
      {
          var str = matchArray[0];
          // gotta do sanity cleanup for url.parse, it makes no assumptions I guess :/
          if(str.substr(0,4).toLowerCase() != "http") str = "http://"+str;
          if(str.indexOf('&quot') == str.length - 5) str = str.substr(0, str.indexOf('&quot')); // stupid twitter escaping
          var u = url.parse(str);
          if(!u.host || u.host.indexOf(".") <= 0 || u.host.length - u.host.indexOf(".") < 3) continue; // TODO: fully normalize
          if(u.hash === '#') u.hash = ''; // empty hash is nothing, normalize that by a pound
          var uf = url.format(u);
          if(ignores[uf]) continue; // skip ones we know about already
          urls[uf] = true;
      }
      urls = Object.keys(urls);
      return urls.length > 0 ? urls : undefined;
    },
    text: 'data.text'
};

exports.related = {
    id: '_id'
};

exports.pumps = {
  types: {
    tweet: function(entry) {
      if(!entry.types) entry.types = {};
      // before state
      var pre = Object.keys(entry.types).length;
      if(entry.data.entities && entry.data.entities.urls && entry.data.entities.urls.length > 0) entry.types.link=true; // first way could be a link
      if(entry.refs) Object.keys(entry.refs).forEach(function(ref){
        if(ref.indexOf(':links/oembed') == -1) return;
        var type = ref.substring(0, ref.indexOf(':'));
        if(type && type.length > 0) entry.types[type] = true; // substrate type
      });
      if(Object.keys(entry.types).length == pre) entry.types.status = true; // only status type if none else above!
    }
  }
}

exports.types = {
  photos: ['photo:twitter/tweets'],
  photos_feed: ['photo:twitter/timeline'],
  news: ['link:twitter/tweets'],
  news_feed: ['link:twitter/timeline'],
  statuses: ['status:twitter/tweets'],
  statuses_feed: ['status:twitter/timeline']
}

exports.defaults = {
  friends: 'contact',
  timeline: 'tweet',
  mentions: 'tweet',
  tweets: 'tweet',
  self: 'contact'
}
