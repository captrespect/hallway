exports.activity = {
	id: function(data){
		var regx = /\d+$/;
		console.log(data.uri);
		return regx.exec(data.uri)[0];
	}
}

exports.user = {
  id: "userID"
}

exports.defaults = {
  self: 'user',
  fitness_acts: 'activity'
}
