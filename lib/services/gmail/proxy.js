var url = require("url");
var imap = require("imap");
var lib = require("./lib");

var IMAP_PAGE_SIZE = 1000;

exports.proxy = function(auth, req, res) {
  // Right now we only accept fetches
  if (req.url != "/raw") {
    res.send(403);
    return;
  }

  var xoauth = lib.generateAuthString({auth:auth});

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
      var options = {request:{headers:false, struct:false, body:true}};
      if (req.query.markSeen && (req.query.markSeen === true || req.query.markSeen == "true")) options.markSeen = true;
      console.log("Getting %s", req.query.id);
      var fetch = conn.fetch(req.query.id, options);
      var fetched = [];
      fetch.on("message", function(msg) {
        var raw = "";
        msg.on("data", function(data) {
          if (data) raw += data;
        });
        msg.on("end", function() {
          fetched.push(raw);
        });
      });
      fetch.on("end", function(msg) {
        res.send(fetched);
        conn.logout();
      });
    });
  });
}
