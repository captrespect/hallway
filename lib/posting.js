var lutil = require('lutil');

exports.postType = function(req, res) {
  var services = req.params('services') || [];
  if (services.length === 0) return res.json(
    // TODO: Reference documentation when it exists
    // https://github.com/Singly/hallway/issues/484
    lutil.jsonErr('Must include "services" parameter.'), 400
  );
};
