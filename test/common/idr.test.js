var idr = require("idr");
var should = require("should");

var parsedIDR;
var testIDR = "test:user@testees/testing#1";

describe("IDR", function() {
  describe("#parse", function() {
    it("should return a parsed idr", function() {
      parsedIDR = idr.parse(testIDR);
      var res = parsedIDR;
      res.should.have.property("protocol", "test");
      res.should.have.property("auth", "user");
      res.should.have.property("host", "testees");
      res.should.have.property("pathname", "testing");
      res.should.have.property("hash", "1");
    });
    it("should return the same idr for a previously parsed idr", function() {
      var res = idr.parse(parsedIDR);
      res.should.have.property("protocol", "test");
      res.should.have.property("auth", "user");
      res.should.have.property("host", "testees");
      res.should.have.property("pathname", "testing");
      res.should.have.property("hash", "1");
    });
  });
  describe("#toString", function() {
    it ("should return the same string as was parsed", function() {
      var res = idr.toString(parsedIDR);
      res.should.equal(testIDR);
    });
  });
  describe("#base", function() {
    it ("should only return the base portions of an idr", function() {
      var res = idr.base(parsedIDR);
      res.should.have.property("protocol", "test");
      res.should.have.property("auth", "user");
      res.should.have.property("host", "testees");
      res.should.have.property("pathname", "testing");
      res.should.not.have.property("hash");
    });
    it ("should return the same on a string idr", function() {
      var res = idr.base(testIDR);
      res.should.have.property("protocol", "test");
      res.should.have.property("auth", "user");
      res.should.have.property("host", "testees");
      res.should.have.property("pathname", "testing");
      res.should.not.have.property("hash");
    });
  });
  describe("#global", function() {
    it ("should return the global portions of an idr", function() {
      var res = idr.global(parsedIDR);
      res.should.have.property("protocol", "test");
      res.should.have.property("host", "testees");
      res.should.have.property("hash", "1");
    });
    it ("should return the global portions of a string idr", function() {
      var res = idr.global(testIDR);
      res.should.have.property("protocol", "test");
      res.should.have.property("host", "testees");
      res.should.have.property("hash", "1");
    });
  });
  describe("#clone", function() {
    it ("should return a new instance of an idr", function() {
      var res = idr.clone(parsedIDR);
      res.should.not.equal(parsedIDR);
    });
  });
  describe("#hash", function() {
    it ("should return a hash of the full idr string", function() {
      var res = idr.hash(parsedIDR);
      res.should.equal("d55d940d8c774d19e3bb6b972f7a0d95");
    });
    it ("should return the same hash for a string idr", function() {
      var res = idr.hash(testIDR);
      res.should.equal("d55d940d8c774d19e3bb6b972f7a0d95");
    });
  });
  describe("#baseHash", function() {
    it ("should return a hash of the base idr string", function() {
      var res = idr.baseHash(parsedIDR);
      res.should.equal("d52acb76ea27ddc12eebf21cb4da292");
    });
    it ("should return the same hash for a string idr", function() {
      var res = idr.baseHash(testIDR);
      res.should.equal("d52acb76ea27ddc12eebf21cb4da292");
    });
  });
});
