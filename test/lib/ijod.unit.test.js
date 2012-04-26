var fakeweb = require("node-fakeweb");
var lconfig = require("lconfig");
var path = require('path');
var helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'));
helper.configurate();
var dal = require("dal");
var ijod = require("ijod");
var should = require("should");

fakeweb.allowNetConnect = false;

fakeweb.registerUri({uri:"http://cb-testing.s3.amazonaws.com:80/d92975de47127d19af4b2a2b24864810/ijod.1334104891338", body:""});

dal.setBackend("fake");
var fakeDB = dal.getBackendModule();

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
    it("should save all entries");
    // it("should save all entries", function(cbDone) {
    //   console.log("GOING TO SAVE");
    //   ijod.batchSmartAdd([{idr:"test:1@testing/test#1"}], function(error) {
    //     cbDone();
    //   });
    // });
  });
  describe("getOne", function() {
// TODO, need help from @temas!
//    fakeDB.addFake(/^SELECT path, offset, len FROM ijod WHERE idr/, function(binds) {
//      return [];
//    });
    it("should return one by idr", function(done) {
      ijod.getOne("contact:709761820@facebook/friends#3409545", function(err, entry){
        done();
      })
    });
    it("should return one by id", function(done) {
      ijod.getOne("f9935b4fbae0d99aa758039539a47b96", function(err, entry){
        done();
      })
    });
  });
  describe("countBase", function() {
    it("should return a count of a base", function(done) {
      fakeDB.addFake(/SELECT COUNT\(\*\) AS baseCount FROM ijod WHERE base/, [{baseCount:42}]);
      ijod.countBase("test:1@testing/test", function(count) {
        done((count == 42 ? null : new Error("Wrong count, expected 42 got " + count)));
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
