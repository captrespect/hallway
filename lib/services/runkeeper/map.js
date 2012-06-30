var regx = /\d+$/;
var crypto = require('crypto');


exports.activity = {
	id: function(data){
		return regx.exec(data.uri)[0];
	}
}

exports.contact = {
	id: function(data){
		return regx.exec(data.url)[0];
	}
}

exports.user = {
  id: "userID"
}

exports.photo = {
	id: function(data) {
		return crypto.createHash('md5').update(data.uri).digest('hex');
	}
}

exports.record = {
	id: "activity_type"	
}

exports.defaults = {
  self: 'user',
  fitness_activities: 'activity',
  strength_activites: 'activity',
  background_activites: 'activity',
  street_team: 'contact',
  records: 'record',
  photos: 'photo'
}
