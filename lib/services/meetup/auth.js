module.exports = {
    endPoint : 'https://secure.meetup.com/oauth2/access',
    grantType : "authorization_code",
    handler : {oauth2 : 'POST'},
    authUrl : 'https://secure.meetup.com/oauth2/authorize?response_type=code'
};


