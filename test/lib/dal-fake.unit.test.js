var dalfake = require("dal-fake");

describe("dal-fake", function() {
  describe("the dal interface", function() {
    it("should create a DB instance");
  });
  describe("the fake interface", function() {
    it("should allow a fake to be added with a javascript array");
    it("should allow for a fake to be added from a JSON file contents");
    it("should allow a no-op fake to be added");
    it("should be reset to no loaded fakes.");
  });
  describe("the db interface", function() {
    it("should succesfully return fake data for a query");
    it("should support binds in fake queries");
    it("should return the an object with the sql being ran");
  });
});
