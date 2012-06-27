exports.activity = {
	id: function(data){
		var regx = /\d+$/;
		return regx.exec(data.uri)[0];
	}
}

exports.user = {
  id: "userID"
}

exports.defaults = {
  self: 'user',
  fitness_acts: 'activity',
  strength_acts: 'activity'
}
