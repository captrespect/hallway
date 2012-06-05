module.exports = {
    endPoint : "https://public-api.wordpress.com/oauth2/token",
    grantType : "authorization_code",
    handler : {oauth2 : 'POST'},
    authUrl : "https://public-api.wordpress.com/oauth2/authorize?response_type=code"
}