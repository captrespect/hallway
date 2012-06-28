var lib = require('./lib.js');

module.exports = {
    handler : function (cbURI, apiKeys, done, req, res) {
        lib.getAccessToken(req, res, function(err, newToken, athleteId) {
            if(err) return done(err);
            if(!newToken) return done(new Error("token missing"));
        	done(null, {token : newToken, athlete_id:athleteId});
		});
    }
}

