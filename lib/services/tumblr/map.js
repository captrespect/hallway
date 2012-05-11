exports.blog = {
  photo: function(data) {
    if(!data.url) return undefined;
    var u = require('url').parse(data.url);
    if(u && u.hostname) return 'http://api.tumblr.com/v2/blog/'+u.hostname+'/avatar/512';
    return undefined;
  },
  id: 'name',
  at: function(data) { return data.updated * 1000 }
};

exports.post = {
  at: function(data) { return data.timestamp * 1000 },
  oembed: function(data) {
    var ret = {type:'photo'};
    ret.height = data.photos[0].original_size.height;
    ret.width = data.photos[0].original_size.width;
    ret.url = data.photos[0].original_size.url;
    return ret;
  }
}


exports.user = {
  id: 'name',
  photo: function(data) {
    var url = require('url');
    for(var i in data.blogs){
	    if(!data.blogs[i].primary) continue;
	    var u = url.parse(data.blogs[i].url);
	    if(u && u.hostname) return 'http://api.tumblr.com/v2/blog/'+u.hostname+'/avatar/512';
	  }
	  return undefined;
  },
  at: function(data) {
    for(var i in data.blogs){
	    if(!data.blogs[i].primary) continue;
	    if(data.updated > 0) return data.updated * 1000;
	  }
	  return Date.now();
  }
}

exports.defaults = {
  following: 'blog',
  dashboard: 'post',
  posts: 'post',
  self: 'user'
}

exports.types = {
  photos: ['photo:tumblr/posts'],
  news: ['link:tumblr/posts', 'quote:tumblr/posts'],
  news_feed: ['link:tumblr/dashboard', 'quote:tumblr/dashboard'],
  photos_feed: ['photo:tumblr/dashboard']
}

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.type) entry.types[entry.data.type] = true;
    }
  }
}