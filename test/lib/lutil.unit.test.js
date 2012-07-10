var lutil = require('lutil');
var assert = require('chai').assert;

describe('lutil', function() {
  describe('#isTrue()', function() {
    it('should return true if true', function() {
      assert.isTrue(lutil.isTrue(true));
    });

    it('should return true if "true"', function () {
      assert.isTrue(lutil.isTrue("true"));
    });

    it('should return true if 1', function() {
      assert.isTrue(lutil.isTrue(1));
    });

    it('should return true if "1"', function() {
      assert.isTrue(lutil.isTrue("1"));
    });

    it('should return true if "yes"', function() {
      assert.isTrue(lutil.isTrue("yes"));
    });

    it('should return false if false', function() {
      assert.isFalse(lutil.isTrue(false));
    });

    it('should return false if 0', function() {
      assert.isFalse(lutil.isTrue(0));
    });

    it('should return false if "0"', function() {
      assert.isFalse(lutil.isTrue("0"));
    });

    it('should return false if "no"', function() {
      assert.isFalse(lutil.isTrue("no"));
    });

    it('should return false if "string"', function() {
      assert.isFalse(lutil.isTrue("string"));
    });
  });
});
