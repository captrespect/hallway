var imap = require("imap");
var lib = require("./lib");

var IMAP_PAGE_SIZE = 1000;

exports.sync = function(pi, callback) {
  var xoauth = lib.generateAuthString(pi);

  var ImapConnection = imap.ImapConnection;
  //create imap connection
  var conn = new ImapConnection({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      debug: true,
      xoauth: xoauth 
  });

  function errorCb(error) {
    conn.logout(function() {
      callback(error);
    });
  }
  conn.connect(function(error) {
    if (error) return errorCb(error);

    conn.openBox("[Gmail]/All Mail", true, function(error, box) {
      if (error) return errorCb(error);
      console.log(box);

      var lastSeenUID = 1;
      if (pi.config && pi.config.uid_validity && box.validity && pi.config.uid_validity == box.validity) {
        // Get more!
        lastSeenUID = (pi.config && pi.config.lastSeenUID) || 1;
      }
      var maxPullID = Math.min(lastSeenUID + IMAP_PAGE_SIZE, box._uidnext);

      var query = [["UID", lastSeenUID + ":" + maxPullID]];
      console.log(query);
      conn.search(query, function(error, messages) {
        var fetch = conn.fetch(messages);
        var msgInfo = [];
        fetch.on("message", function(msg) {
          msg.uid = msg.id;
          msg.id = msg["x-gm-msgid"];
          var timestamp = new Date(msg.date);
          msg.at = timestamp.getTime();
          msgInfo.push(msg);
        });
        fetch.on("end", function() {
          conn.logout(function() {
            var config = {lastSeenUID:maxPullID, uid_validity:box.validity};
            if (maxPullID < box._uidnext) config.nextRun = -1;
            var key = "envelope:" + pi.auth.pid + "/headers";
            callback(null, {config:config, auth:pi.auth, data:{key:msgInfo}});
          });
        });
      });
    });
  });
};
