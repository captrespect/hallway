exports.sync = require('./lib').genericSync(function(pi){
    return "people/~:(id,first-name,last-name,headline,location:(name,country:(code)),industry,current-share,num-connections,summary,specialties,proposal-comments,associations,honors,interests,positions,publications,patents,languages,skills,certifications,educations,num-recommenders,recommendations-received,phone-numbers,im-accounts,twitter-accounts,date-of-birth,main-address,member-url-resources,picture-url,site-standard-profile-request:(url),api-standard-profile-request:(url),site-public-profile-request:(url),api-public-profile-request:(url),public-profile-url)?format=json";
},function(pi, js, cb){
    pi.auth.profile = js; // stash
    pi.auth.pid = js.id+'@linkedin'; // profile id
    var base = 'profile:'+pi.auth.pid+'/self';
    var data = {};
    data[base] = [js];
    cb(null, {auth:pi.auth, data:data});
});
