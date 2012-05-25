var request = require('request');
var fs = require('fs');
var async = require('async');
var path = require('path');

var token = process.argv[2] || console.error("tolken?") || process.exit(1);
var base = process.argv[3] || 'http://localhost:8042/';
token = '?access_token='+token;

var snap = {};
var calls = 0;
var start = Date.now();
get('profiles', function(j){
  async.forEach(Object.keys(j), function(service, cb1){
    if(service == 'id' || service == 'all') return cb1();
    get('services/'+service, function(s){
      async.forEach(Object.keys(s), function(k, cb2){
        get('services/'+service+'/'+k, function(d){
          snap['services/'+service+'/'+k] = d.length;
          cb2()
        });
      }, cb1);
    });
  }, function(){
    get('types', function(t){
      async.forEach(Object.keys(t), function(type, cb1){
        get('types/'+type, function(s){
          snap['types/'+type] = s.length;
          cb1()
        });
      }, function(){
        var last = {};
        if(path.existsSync(path.join(__dirname,'snaps','last.json'))) try {
          last = JSON.parse(fs.readFileSync(path.join(__dirname,'snaps','last.json')));
        }catch(E){console.error(E)}
        var union = {};
        Object.keys(snap).forEach(function(k){union[k]=true});
        Object.keys(last).forEach(function(k){union[k]=true});
        Object.keys(union).sort().forEach(function(k){
          var change = (snap[k] > last[k]) ? "MORE" : "LESS";
          if(snap[k] === last[k]) change = "SAME";
          console.log(change,snap[k],last[k],k);
        });
        var end = Date.now();
        console.log(calls,"calls in",(end-start)/1000,"seconds, ",(end-start)/calls,"ms per call");
        fs.writeFileSync(path.join(__dirname,'snaps','last.json'), JSON.stringify(snap));
        fs.writeFileSync(path.join(__dirname,'snaps','at.'+Date.now()+'.json'), JSON.stringify(snap));
      });      
    });
  });
});

function get(u, cb)
{
  calls++;
  request.get({url:base+u+token, json:true}, function(e,r,j){
    if(e) console.error(u,e) || process.exit(1);
    if(r.statusCode != 200) console.error(u,r.statusCode,j) || process.exit(1);
    if(!j) console.error(u,"no data") || process.exit(1);
    cb(j);
  });
}