var lconfig = require('lconfig');
lconfig.load('Config/config.json');
var dal = require('dal');
var async = require('async');
var ijod = require('ijod');

var start = process.argv[2] || Date.now()+100000;
ijod.initDB(function(){
  step({at:start, total:0, del:0});  
})

var deleteme = process.argv[3] === 'MEOW';

function step(arg)
{
  dal.query("select at, idr, base, hash from ijod where at >= (select min(at) from (select at from ijod where at < ? order by at desc limit 1000) as sq1) and at <= ?", [arg.at, arg.at], function(err, rows){
    if(err) return console.error(err, arg);
    var min = arg.at;
    arg.total += rows.length;
    var ndx = {};
    var dups = [];
    rows.forEach(function(row){
      if(row.at < min) min = parseInt(row.at);
      var key = row.base+row.hash;
      if(ndx[key]) {
        dups.push([ndx[key],row.idr].join(" "));
      }
      ndx[key] = row.idr;
    });
    arg.del += dups.length;
    console.log(arg.total,arg.del,arg.at);
    if(min == arg.at) return console.error("done?",arg);
    arg.at = min;
    console.log(min,"dups",dups.length);
    async.forEach(dups, function(dup, cb){
      var ids = dup.split(" ");
      ijod.getOne(ids[0], function(err, entry){
        var bad;
        if(entry.id.indexOf(ids[0]) == -1) bad = ids[0];
        if(entry.id.indexOf(ids[1]) == -1) bad = ids[1];
        if(!bad || !deleteme) return cb();
        dal.query("delete from ijod where idr = ?",[bad], cb);
      })
    }, function(err){
      if(err) return console.error(err);
      step(arg);
    });
  });
}