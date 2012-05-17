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
    if(data.type == 'photo')
    {
      ret = {type:'photo'};
      // sometimes tumblr returns 0 size! https://github.com/Singly/API/issues/43
      if(data.photos[0].original_size.height > 0) ret.height = data.photos[0].original_size.height;
      if(data.photos[0].original_size.width > 0) ret.width = data.photos[0].original_size.width;
      ret.url = data.photos[0].original_size.url;
      return ret;
    }
    if(data.type == 'link')
    {
      ret = {type:'link'};
      ret.title = data.title;
      if(data.description) ret.description = data.description.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " ");
      ret.url = data.url;
      return ret;
    }
    if(data.type == 'video')
    {
      ret = {type:'video'};
      if(data.title) ret.title = data.title;
      if(data.caption) ret.description = data.caption.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " ");
      ret.url = data.permalink_url || data.post_url;
      if(data.thumbnail_url) ret.thumbnail_url = data.thumbnail_url;
      if(data.player && data.player.length > 0) data.html = data.player[data.player.length-1].embed_code;
      return ret;
    }
    if(data.type == 'quote')
    {
      ret = {type:'link'};
      ret.title = data.source_title;
      ret.description = data.text;
      ret.url = data.source_url;
      return ret;
    }
    return undefined;
  },
  text: function(data) {
    var ret = data.title || "";
    if(data.body) {
      if(ret) ret += ": ";
      ret += data.body.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " ");
    }
    if(data.description) {
      if(ret) ret += ": ";
      ret += data.description.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " ");
    }
    if(data.text) {
      if(ret) ret += ": ";
      ret += data.text.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " ");
    }
    if(data.caption) {
      if(ret) ret += ": ";
      ret += data.caption.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " ");
    }
    return ret.length > 0 ? ret : undefined;
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
  photos_feed: ['photo:tumblr/dashboard'],
  news: ['link:tumblr/posts', 'quote:tumblr/posts'],
  news_feed: ['link:tumblr/dashboard', 'quote:tumblr/dashboard'],
  videos: ['videos:tumblr/posts'],
  videos_feed: ['videos:tumblr/dashboard'],
  statuses: ['text:tumblr/posts'],
  statuses_feed: ['text:tumblr/dashboard']
}

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.type) entry.types[entry.data.type] = true;
    }
  }
}