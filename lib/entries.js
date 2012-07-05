var async = require('async');
var logger = require('logger').logger('entries');
var ijod = require('ijod');

// we expect options to be sane here first!
exports.runBases(bases, options, cbEach, cbDone)
{
  options.steps = options.steps && ++options.steps || 1;
  // often this is just a drive-thru
  windower(bases, options, function(){
    var batch = [];
    async.forEach(bases, function(base, cb) {
      ijod.getRange(base, options, function(item) {
        batch.push(item);
      }, function(err, flags) {
        if(err) logger.warn(err);
        
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
        batch.slice(0,options.limit).forEach(cbEach);
        // if we have enough, we've stepped too much, or there werent enough results, we're done!
        if(batch.length >= options.limit || options.steps > 5 || !flags || flags.rawlen < options.limit)) return cbDone(err);
        // recurse and get the remainder, starting from last point and whatever limit is left
        logger.info("recursing to get more",bases,options,batch.length);
        options.limit = batch.length - options.limit;
        var oldest = batch.pop();
        options.since = oldest.at;
        exports.runBases(bases, options, cbEach, cbDone);
      });
    });
  });
}

// optionally modifies options to create a fixed time window matching the requirements when multiple bases
function windower(bases, options, cb)
{
  if(bases.length == 1) return cb();

  // offset is a fucktird to support but we do it by asking for everything till then
  options.limit += options.offset;
  var times = [];
  async.forEach(bases, function(base, cb) {
    ijod.getTardis(base, options, function(err, rows) {
      if(rows) rows.forEach(function(row){ times.push(row.at) });
      return cb();
    });
  }, function() {
    if(batch.length == 0) return cb(); // better safe
    batch.sort(function(a,b) { return b.at - a.at });
    // restore limit!
    options.limit -= options.offset;
    var subset = batch.slice(options.offset, options.limit);
    options.offset = 0; // must zero out for any recursion
    // force shared window size, inclusive!
    if(subset.length > options.limit)
    {
      options.since = subset[0].at - 1;
      options.until = subset[subset.length - 1].at + 1;
    }
    cb();
  });
}