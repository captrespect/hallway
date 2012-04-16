var logger = require("logger").logger("NoticationCenter");

// This pumping station expects a changeset as it's input it will send a notification to a registered apps url
exports.pump = function(ijChangeset, cbDone) {
  cbDone(null);
}

