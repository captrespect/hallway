var baseURL = 'https://graph.facebook.com/oauth/authorize?response_type=code&scope=email,offline_access,read_stream,user_birthday,user_religion_politics,user_relationships,user_relationship_details,user_hometown,user_location,user_likes,user_activities,user_interests,user_education_history,user_work_history,user_website,user_groups,user_events,user_photos,user_videos,user_photo_video_tags,user_notes,user_about_me,user_status,friends_birthday,friends_religion_politics,friends_relationships,friends_relationship_details,friends_hometown,friends_location,friends_likes,friends_activities,friends_interests,friends_education_history,friends_work_history,friends_website,friends_groups,friends_events,friends_photos,friends_videos,friends_photo_video_tags,friends_notes,friends_about_me,friends_status,user_checkins,friends_checkins,user_subscriptions,friends_subscriptions,publish_stream,publish_checkins,create_event,create_note,photo_upload,publish_actions,share_item,status_update,video_upload';
module.exports =  {
    endPoint : 'https://graph.facebook.com/oauth',
    grantType : '',
    handler : {oauth2 : 'GET'},
    authUrl : function(req) {
      var ua = req && req.headers && req.headers['user-agent'];
      if (ua && isMobile(ua)) return baseURL + '&display=touch';
      return baseURL;
    }
};


// via http://stackoverflow.com/questions/6163350/server-side-browser-detection-node-js
function isMobile(ua) {
  var $ = {};

  if (/mobile/i.test(ua))
    $.Mobile = true;

  if (/like Mac OS X/.test(ua)) {
    $.iOS = /CPU( iPhone)? OS ([0-9\._]+) like Mac OS X/.exec(ua)[2].replace(/_/g, '.');
    $.iPhone = /iPhone/.test(ua);
    $.iPad = /iPad/.test(ua);
  }

  if (/Android/.test(ua))
    $.Android = true; ///Android ([0-9\.]+)[\);]/.exec(ua)[1];
  // XXX:  Mozilla on android does not have a parenthetical version

  if (/webOS\//.test(ua))
    $.webOS = true; ///webOS\/([0-9\.]+)[\);]/.exec(ua)[1];
  // XXX: Forcing this to true for now

  // if (/(Intel|PPC) Mac OS X/.test(ua))
  //   $.Mac = /(Intel|PPC) Mac OS X ?([0-9\._]*)[\)\;]/.exec(ua)[2].replace(/_/g, '.') || true;
  //
  // if (/Windows NT/.test(ua))
  //   $.Windows = /Windows NT ([0-9\._]+)[\);]/.exec(ua)[1];

  return ($.Mobile || $.iPhone || $.Android || $.webOS);
}
