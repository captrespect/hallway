exports.profile = {
  id: function(data) { return data.id && data.id.$t },
  at: function(data) { return data.updated && data.updated.$t && Date.parse(data.updated.$t) }
}

exports.contact = {
  id: function(data) { return data.id.$t.substring(data.id.$t.lastIndexOf('/') + 1); },
  at: function(data) { return data.updated && data.updated.$t && Date.parse(data.updated.$t) },
  oembed: function(data) {
    var ret = {type:'contact'};
    ret.title = data.title.$t;
    if(data.gd$email) ret.email = data.gd$email[0].address;
    return ret;
  }
}

exports.defaults = {
  self: 'profile',
  contacts: 'contact'
}

exports.types = {
  contacts: ['contact:gcontacts/contacts']
}

// serve back the media
exports.media = {
  contact: function(auth, entry, res)
  {
    if(!entry.data.link) return res.send('missing url', 404);
    for(var i = 0; i < entry.data.link.length; i++)
    {
      var link = entry.data.link[i];
      // TODO depending on access token being alive and auto-refreshed by self.js, need to fix gdata-js to expose a function to do this
      if(link.rel.indexOf('#photo') > 0) return res.redirect(link.href + (link.href.indexOf('?') ? '&' : '?') + 'oauth_token=' + auth.token.access_token); 
    };
    res.send('no photo',404);
  }
}