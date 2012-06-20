exports.profile = {
  id:function(data){ return [data.ID, data.site.ID].join('.') },
  photo:'avatar_URL',
  text: function(data){ return [data.site.name, data.display_name, data.username, data.email].join(' ')}
}

var ent = require('ent');
function strip(html)
{
  if(!html) return html;
  return ent.decode(html.replace(/<\S[^><]*>/g, " ").replace(/\s+/g, " "));
}

var crypto = require('crypto');
var urllib = require('url');
exports.post = {
  // .ID isn't unique site-wide, but URL is
  id: function(data){ return crypto.createHash('md5').update(data.URL).digest('hex') },
  at: function(data){ return new Date(data.modified||data.date).getTime() },
  text: function(data){ return strip([data.title, data.excerpt].join(' ')) },
  ll: function(data){ 
    if(!data.geo || !data.geo.latitude) return undefined;
    return [data.geo.latitude,data.geo.longitude];
  },
  oembed: function(data){
    var ret = {type:'link'};
    ret.url = data.URL;
    ret.description = strip(data.excerpt);
    ret.title = data.title;
    if(data.editorial && data.editorial.image) ret.thumbnail_url = data.editorial.image;
    ret.provider_name = 'wordpress';
    if(data.author && data.author.name) ret.author_name = data.author.name;

    // if it contains a primary image and there's not much content, it's a photo-only, roughly speaking
    if(ret.thumbnail_url && data.content == data.excerpt) {
      ret.type = 'photo';
      var url = urllib.parse(ret.thumbnail_url,true);
      ret.url = url.query.url || ret.thumbnail_url;
      return ret;
    }

    // no links == status
    if(data.content.indexOf('http') == -1) {
      var ret = {type:'status'};
      return ret;
    }

    return ret;
  },
  author: function(data) {
    if(!data.author) return undefined;
    var ret = {};
    ret.name =  data.name;
    ret.url = data.URL;
    ret.photo = data.avatar_URL;
    return ret;
  }
}

exports.defaults = {
  self: 'profile',
  feed: 'post',
  posts: 'post'
}

exports.types = {
  photos: ['photo:wordpress/posts'],
  photos_feed: ['photo:wordpress/feed'],
  news: ['link:wordpress/posts'],
  news_feed: ['link:wordpress/feed'],
  statuses: ['status:wordpress/post'],
  statuses_feed: ['status:wordpress/feed'],  
}

exports.pumps = {
  types: {
    post: function(entry) {
      if(!entry.types) entry.types = {};
      var oe = exports.post.oembed(entry.data);
      entry.types[oe.type] = true;
    }
  }
}