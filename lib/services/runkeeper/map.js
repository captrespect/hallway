var regx = /\d+$/;


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

exports.defaults = {
  self: 'user',
  fitness_acts: 'activity',
  strength_acts: 'activity',
  background_acts: 'activity',
  street_team: 'contact'
}
