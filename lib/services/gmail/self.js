var lib = require("./lib");
var imap = require("imap");

exports.sync = lib.genericSync('https://www.google.com/m8/feeds/contacts/default/full?alt=json', function(pi, resp, cbDone) {
  var emailAddy = resp.feed.id.$t;
  pi.auth.pid = encodeURIComponent(emailAddy) + "@gmail";
  console.log("****** EMAIL ADDY IS %s", emailAddy);
  var xoauth = lib.generateAuthString(pi);
  console.log("****** Auth string is: %s", xoauth);

  var ImapConnection = imap.ImapConnection;
  //create imap connection
  var conn = new ImapConnection({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      debug: true,
      xoauth: xoauth 
  });

  conn.connect(function(error) {
    if (error) {
      conn.logout(function() {
        console.log("************* connect error: %s", error);
        cbDone(error);
      });
      return;
    }
    conn.getBoxes(function(error, boxes) {
      if (error) {
        conn.logout(function() {
          console.log("************* getBoxes error: %s", error);
          cbDone(error);
        });
        return;
      }

      var allBoxes = [];
      function parseBoxes(box, list) {
        Object.keys(box).forEach(function(subbox) {
          var curBox = {
            name:subbox,
            deilm:box[subbox].delim
          };
          if (box[subbox].children) {
            curBox.children = [];
            parseBoxes(box[subbox].children, curBox.children);
          }
          list.push(curBox);
        });
      }
      parseBoxes(boxes, allBoxes);
      conn.logout(function() {
<<<<<<< HEAD
        var key = "profile:" + pi.auth.pid + "/self";
        cbDone(null, {auth:pi.auth, data:{key:{boxes:allBoxes, email:emailAddy}}});
=======
        cbDone(null, {auth:pi.auth, data:allBoxes});
>>>>>>> 428cd0f2b2fae20e190b5220778d94d44adddc6a
      });
    });
  });
});
