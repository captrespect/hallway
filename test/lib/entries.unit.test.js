var entries = require('entries');

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
});
