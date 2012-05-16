exports.update = {
  at: 'timestamp',
  id: function(data) {
    // linkedin says updateKey is unique, ITS NOT! http://jeremie.com/i/1385019d0c49d378883066e60abfc697.png
    return require('crypto').createHash('md5').update(data.updateKey+' '+JSON.stringify(data.updateContent)).digest('hex')
  },
  urls: function(data) {
    if(data.updateType != 'STAT') return undefined; // only status updates have links?
    if(!data.updateContent || typeof data.updateContent.currentStatus != "string") return undefined;
    var url = require('url');
    var urls = {};
    var regexToken = /((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/g;
    // when you use /g on a regex it magically maintains state between .exec() calls, CRAZY TIMES!
    var matchArray;
    while( (matchArray = regexToken.exec( data.updateContent.currentStatus )) !== null )
    {
        var str = matchArray[0];
        // gotta do sanity cleanup for url.parse, it makes no assumptions I guess :/
        if(str.substr(0,4).toLowerCase() != "http") str = "http://"+str;
        var u = url.parse(str);
        if(!u.host || u.host.indexOf(".") <= 0 || u.host.length - u.host.indexOf(".") < 3) continue; // TODO: fully normalize
        if(u.hash === '#') u.hash = ''; // empty hash is nothing, normalize that by a pound
        var uf = url.format(u);
        urls[uf] = true;
    }
    urls = Object.keys(urls);
    return urls.length > 0 ? urls : undefined;
  }
  
}

exports.defaults = {
  connections: 'profile',
  updates: 'update',
  network: 'update',
  self: 'profile'
}

exports.types = {
  news: ['linklink:linkedin/updates'],
  news_feed: ['linklink:linkedin/network'],
}

exports.pumps = {
  types: {
    update: function(entry) {
      if(!entry.types) entry.types = {};
      if(entry.data.updateType) entry.types[entry.data.updateType.toLowerCase()] = true;
      if(entry.refs) Object.keys(entry.refs).forEach(function(ref){
        if(ref.indexOf(':links/oembed') == -1) return;
        var type = ref.substring(0, ref.indexOf(':'));
        var id = ref.substring(ref.indexOf('#')+1);
        if(type && type.length > 0) entry.types['link'+type] = id; // substrate type
      });
    }
  }
}