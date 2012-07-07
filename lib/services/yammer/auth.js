module.exports = {
    endPoint : 'https://www.yammer.com/oauth2/access_token.json',
    grantType : "authorization_code",
    handler : {oauth2 : 'POST'},
    authUrl : 'https://www.yammer.com/dialog/oauth'
};
