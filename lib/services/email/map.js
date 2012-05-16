exports.contact = {
  id:'email'
}

// node's url lib parses file:X specially and breaks idrs, @#$@#!!
exports.afile = {
  id:'file_id',
  at: function(data) { return data.date * 1000 }
}

exports.defaults = {
  self: 'profile',
  contacts: 'contact',
  photos: 'afile',
  photos_feed: 'afile'
}

// serve back the media
exports.media = {
  afile: function(auth, entry, res)
  {
    require('./lib').fetch(auth, 'accounts/'+auth.account+'/files/'+entry.data.file_id+'/content?as_link=1', function(err, url){
      if(err) return res.send(err, 500);
      if(!url) return res.send('missing url', 500);
      res.redirect(url);
    });
  }
}