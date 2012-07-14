var entries = require('entries');
var should = require("should");

describe("Entries", function() {
  describe("options", function() {
    it("should do nothing", function(done) {
      entries.options({});
      done();
    });
  });
  describe("filter", function() {
    it("should not crash", function(done) {
      entries.filter([], {});
      done();
    });
  });
  describe("bases", function() {
    it("should do services", function(done) {
      entries.bases("/services/twitter/friends", {}, ['42@twitter','69@twitter']).length.should.equal(2);
      entries.bases("/services/twitter/friends", {services:'42@twitter'}, ['42@twitter','69@twitter']).length.should.equal(1);
      done();
    });
    it("should do types", function(done) {
      entries.bases("/types/photos", {}, ['42@twitter','69@facebook']).length.should.equal(2);
      entries.bases("/types/photos", {services:'twitter'}, ['42@twitter','69@facebook']).length.should.equal(1);
      done();
    });
  });

});
