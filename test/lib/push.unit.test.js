var push = require("push");

describe("Push", function() {
  describe("pump", function() {
    it("should do nothing", function(done) {
      push.pump([], {}, done);
    });
  });
});
