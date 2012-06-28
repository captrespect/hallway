/* This scrapes all rides, efforts, and segments */


var strava = require('./lib.js');



exports.sync = function (pi, cb) {
	var id = pi.auth.athlete_id;
	var newestRide = pi.config.newestRide || 0;
	var data = {};
	data['ride:'+pi.auth.pid+'/rides'] = rides = [];
	data['effort:'+pi.auth.pid+'/efforts'] = efforts = [];
	data['path:'+pi.auth.pid+'/paths'] = paths = [];
	strava.getRidesWithDetails({athleteId:id, startId:newestRide}, function(err, ridesWithDetails) {
		rides = ridesWithDetails;
		pi.config.newestRide = rides[rides.length-1].id;
		ridesWithDetails.forEach(function(ride){
			strava.getEffortsWithDetails(ride.id, function(err, effortsWithDetails){
				efforts = effortsWithDetails;
				strava.getPaths(pi.auth.token, ridesWithDetails, function(err, ridePaths){
					paths = ridePaths;
					cb(err, {data:data, config:pi.config});
				});
			});
		});
	});
}




