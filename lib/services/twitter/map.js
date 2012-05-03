exports.contact = {
    photo: 'profile_image_url',
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
      
    }
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
