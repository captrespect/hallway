var regx = /\d+$/;
var crypto = require('crypto');


exports.activity = {
	id: function(data){
//		console.log(uri);
		return regx.exec(data.uri)[0];
	}
}

exports.contact = {
	id: function(data){
//		console.log(uri);
		return regx.exec(data.url)[0];
	}
}

exports.user = {
  id: "userID"
}

exports.photo = {

}


exports.record = {
	id: "activity_type"	
}

exports.defaults = {
  self: 'user',
  fitness_acts: 'activity',
  strength_acts: 'activity',
  background_acts: 'activity',
  street_team: 'contact',
  records: 'record',
  photos: 'photo'
}
