var async = require('async');
var logger = require('logger').logger('entries');
var ijod = require('ijod');
var qix = require('qix');
var lutil = require('lutil');

// we expect options to be sane here first!
exports.runBases = function(bases, options, cbEach, cbDone)
{
  // if first time, since we recurse, track special things
  if(!options.orig)
  {
    options.orig = {since:options.since, until:options.until, limit:options.limit};
    options.steps = 0;
    options.skips = {};
    options.left = options.limit;
  }
  options.steps++;
  // often this is just a drive-thru
  windower(bases, options, function(none){
    logger.debug("windowed",options,none);
    if(none) return cbDone(); // nothing to return
    var batch = [];
    var maxed = false; // track if any base got all results
    async.forEach(bases, function(base, cb) {
      ijod.getRange(base, options, function(item) {
        if(options.skips[item.id]) return; // skip complete exact dups
        options.skips[item.id] = base;
        batch.push(item);
      }, function(err, flags) {
        if(err) logger.warn(err);
        if(flags && flags.rawlen == options.limit) maxed = true; // at least one was 'full'
        cb();
      });
    }, function() {
      // condense down!
      if(options.dedup) {
        // first sort old->new as oldest is the primary signal
        batch.sort(function(a,b) { return a.at - b.at; });

        var batch2 = [];
        var guids = {};

        batch.forEach(function(item) {
          if(!item.guid) return batch2.push(item);
          if(!guids[item.guid]) batch2.push(item);
          guids[item.guid] = true;
        });

        batch = batch2;
      }
      batch.sort(function(a,b) { return b.at - a.at });
      var ret = batch.slice(0, options.left);
      ret.forEach(function(entry){cbEach(entry, options.skips[entry.id])});
      options.left -= ret.length;
      // if we have enough, we've stepped too much, or there werent enough results, we're done!
      if(options.left <= 0 || options.steps > 5 || !maxed) return cbDone();
      // recurse and get the remainder, starting from last point if any or upping limit otherwise
      if(ret.length > 0)
      {
        options.until = ret[ret.length - 1].at;
        options.since = options.orig.since; // reset to orig since windower may have shrunk
      }else{
        options.limit = options.limit * 2;
      }
      logger.info("recursing to get more",bases,options,batch.length);
      exports.runBases(bases, options, cbEach, cbDone);      
    });
  });
}

// optionally modifies options to create a fixed time window matching the requirements when multiple bases
function windower(bases, options, cb)
{
  if(bases.length == 1) return cb();

  var times = [];
  async.forEach(bases, function(base, cb) {
    ijod.getTardis(base, options, function(err, rows) {
      if(rows) rows.forEach(function(row){ times.push(row.at) });
      return cb();
    });
  }, function() {
    logger.debug("tardis",times.length,options);
    if(times.length == 0) return cb(); // better safe
    times.sort(function(a,b) { return b - a });
    var subset = times.slice(0, options.limit);
    if(subset.length == 0) return cb(true);
    // force shared window size, inclusive!
    if(times.length > options.limit)
    {
      options.until = parseInt(subset[0]) + 1;
      options.since = parseInt(subset[subset.length - 1]) - 1;
    }
    cb();
  });
}

// util to take a standard entries request and turn it into options and bases
exports.parseReq = function(path, query)
{
  var ret = {bases:[], options:{}};
  if(!path) return ret;

  ret.options.since = parseInt(query['since']) || undefined;
  ret.options.until = parseInt(query['until']) || undefined;
  ret.options.limit = parseInt(query['limit']) || 20;
  ret.options.q = query.q;
  if(query.participants) ret.options.participants = query.participants.split(",");
  ret.options.dedup = lutil.isTrue(query.dedup);

  // legacy, to be deleted when unused or v1
  if(query.min_count) ret.options.limit = parseInt(query.min_count);
  if(query.max_count) ret.options.limit = parseInt(query.max_count);

  // sanity checks
  if(ret.options.limit < 0) ret.options.limit = 20;

  // near=lat,lng&within=X
  if(query.near)
  {
    var ll = query.near.split(",");
    var lat = parseFloat(ll[0]);
    var lng = parseFloat(ll[1]);
    var within = parseFloat(req.query.within||10); // kilometers
    if(typeof within != 'number' || isNaN(within) || typeof lat != 'number' || isNaN(lat) || typeof lng != 'number' || isNaN(lng) ) {
      logger.warn("invalid near/within",query.near,within)
    }else{
      var diff = (Math.asin(Math.sin((within / 6371) / 2)) * 2) / Math.PI * 180; // radians, bounding box
      options.box = {lat:[lat+diff, lat-diff], lng:[lng+diff, lng-diff]};
      options.box.lat.sort(function(a,b){return a-b});
      options.box.lng.sort(function(a,b){return a-b});
    }
  }
  
  return ret;
}

// apply and enforce any options to the result entry to validate it, the boundary between here and ijod is weird yet
exports.filter = function(entries, options)
{
  return entries.filter(function(entry){
    if(options.q)
    {
      var q = qix.chunk(ijod.qtext(entry));
      var parts = qix.chunk(options.q);
      var matches = 0;
      parts.forEach(function(part){if(q.indexOf(part) >= 0) matches++ });
      if(matches != parts.length)
      {
        logger.warn("couldn't find QUERY ",parts.join(','),"in",q.join(','));
        return false
      }
    }
    if(options.participants)
    {
      var pentry = ijod.participants(entry);
      var matches = 0;
      options.participants.forEach(function(par){
        if(par.indexOf('^') == 0 && (par == "^self" || pentry[0] == par.substr(1))) return matches++; // authors are [0]
        if(par == "self" || par.indexOf(">") == 0 || pentry.indexOf(par) >= 0) matches++;
      });
      if(matches != options.participants.length)
      {
        logger.warn("couldn't find PARTICIPANTS ",options.participants.join(','),"in",pentry.join(','));
        return false;
      }            
    }
    if(options.box)
    {
      var ll = dMap.get('ll',entry.data,entry.idr);
      if(!ll) return false
      // TODO someday use actual circle or poly filter of results to make them even more accurate :)      
      var within = (ll[0] > options.box.lat[0] && ll[0] < options.box.lat[1] && ll[1] > options.box.lng[0] && ll[1] < options.box.lng[1]) ? true : false;
      if(!within) return false
    }
    
    // we don't apply limits, since, until, etc here since that is done by ijod, and in the case of push filtering it doesn't make sense
    return true;
  }); 
}