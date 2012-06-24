module.exports = {
    endPoint : 'https://runkeeper.com/apps/token',
    grantType : "authorization_code",
    handler : {oauth2 : 'POST'},
    authUrl : 'https://runkeeper.com/apps/authorize?response_type=code'
};
