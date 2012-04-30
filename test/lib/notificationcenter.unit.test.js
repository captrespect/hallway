var nc = require("notificationcenter");

describe("Notification Center", function() {
  describe("pump", function() {
    it("should do nothing", function(done) {
      nc.pump([], done);
    });
  });
});
