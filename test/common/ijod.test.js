var dal = require("dal");
var fakeweb = require("node-fakeweb");
var lconfig = require("lconfig");
var path = require('path');
var helper  = require(path.join(__dirname, '..', 'lib', 'locker-helper.js'));
helper.configurate();
var ijod = require("ijod");

fakeweb.allowNetConnect = false;

fakeweb.registerUri({uri:"http://cb-testing.s3.amazonaws.com:80/d92975de47127d19af4b2a2b24864810/ijod.1334104891338", body:""});

dal.setBackend("fake");
fakeDB = dal.getBackendModule();

var realDateNow = Date.now;
Date.now = function() {
  return 1334104891338;
}

describe("IJOD", function() {
  describe("#batchSmartAdd", function() {
    fakeDB.addNoOp(/^DELETE FROM batchSmartAdd/);
    fakeDB.addNoOp(/^INSERT INTO batchSmartAdd/);
    fakeDB.addNoOp(/^SELECT idr,hash FROM ijod WHERE ijod.idr IN \(SELECT idr FROM batchSmartAdd/);
    fakeDB.addFake(/^REPLACE INTO ijod VALUES/, function(binds) {
      return [];
    });
    it("should save all entries", function(cbDone) {
      console.log("GOING TO SAVE");
      ijod.batchSmartAdd([{idr:"test:1@testing/test#1"}], function(error) {
        console.log("************ DONE");
        cbDone();
      });
    });
  });
});

    /*
    require("ijod").getOne("contact:709761820@facebook/friends#3409545", function(error, entry) {
      console.log("getOne: %j", entry);
    });
    var entryCount = 0;
    require("ijod").getRange("contact:709761820@facebook/friends", {}, function(entry) {
      ++entryCount;
      console.log("Got: %j", entry);
    }, function(error) {
      console.log("All done with entries, got %d", entryCount);
    });
    return;
    */
