// to use, might need to: export NODE_PATH="/Users/jer/hallway/Common/node:/Users/jer/hallway/lib"
var path = require('path');
var fs = require('fs');
var lconfig = require(path.join(__dirname, "../Common/node/lconfig.js"));
lconfig.load(path.join(__dirname, "../Config/config.json"));
var dal = require('dal');
var crypto = require('crypto');

// simple admin utility to create a new app key
var notes = process.argv[2];

dal.acquire(function(err, db) {
  if(err) return console.error(err);
  app = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  secret = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  db.query("INSERT INTO Apps (app, secret, notes) VALUES (?, ?, ?)", [app, secret, notes], function(err) {
    dal.release(db);
    if(err) return console.error(err);
    console.log("key: "+app);
    console.log("secret: "+secret);
    process.exit(0);
  });
});

