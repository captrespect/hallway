exports.sync = function(pi, cb)
{
  require('./lib').fetch(pi.auth, 'accounts/'+pi.auth.account+'/contacts?limit=500', function(err, js){
    if(err) return cb(err);
    if(!js || !js.matches) return cb(new Error("invalid/missing data"));
    var data = {};
    data['contact:'+pi.auth.pid+'/contacts'] = js.matches;
    cb(null, {auth:pi.auth, data:data});    
  });
}
