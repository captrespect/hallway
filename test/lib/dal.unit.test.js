var lconfig = require("lconfig");
if (!lconfig.database) lconfig.database = {};
lconfig.database.maxConnections = 1;
var dal = require("dal");

console.log(lconfig);

dal.setBackend("fake");

describe("DAL", function() {
  describe("batched queries", function() {
    it("should be executed");
  });
  describe("single queries", function() {
    it("should be executed");
    it("should allow for argument binding");
    it("should callback with the returned rows");
  });
});
