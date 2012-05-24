module.exports =  {
    endPoint : 'https://graph.facebook.com/oauth',
    grantType : '',
    handler : {oauth2 : 'GET'},
    authUrl : 'https://graph.facebook.com/oauth/authorize?response_type=code&scope=email,offline_access,read_stream,user_birthday,user_religion_politics,user_relationships,user_relationship_details,user_hometown,user_location,user_likes,user_activities,user_interests,user_education_history,user_work_history,user_website,user_groups,user_events,user_photos,user_videos,user_photo_video_tags,user_notes,user_about_me,user_status,friends_birthday,friends_religion_politics,friends_relationships,friends_relationship_details,friends_hometown,friends_location,friends_likes,friends_activities,friends_interests,friends_education_history,friends_work_history,friends_website,friends_groups,friends_events,friends_photos,friends_videos,friends_photo_video_tags,friends_notes,friends_about_me,friends_status,user_checkins,friends_checkins,user_subscriptions,friends_subscriptions'
};