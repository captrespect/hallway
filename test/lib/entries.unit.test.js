var entries = require('entries');

describe("Entries", function() {
  describe("parseReq", function() {
    it("should do nothing", function(done) {
      entries.parseReq("/", {});
      done();
    });
  });
  describe("filter", function() {
    it("should not crash", function(done) {
      entries.filter([], {});
      done();
    });
  });
});
