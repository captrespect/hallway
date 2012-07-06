var async = require('async');
var logger = require('logger').logger('entries');
var ijod = require('ijod');

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