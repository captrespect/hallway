var should  = require('should');
var posting = require('posting');

function mockReq(params) {
  return {
    params: function(key) {
      return params[key];
    }
  };
}

describe('Posting Out', function() {
  var req, res;

  function itValidatesServices() {
    it('responds with HTTP 400', function(done) {
      posting.postType(req, {
        json: function(data, code) {
          code.should.equal(400);
          done();
        }
      });
    });

    it('gives you an error message', function(done) {
      posting.postType(req, {
        json: function(data, code) {
          should.exist(data.error);
          done();
        }
      });
    });
  }

  describe('when you forget the services parameter', function() {
    beforeEach(function(done) {
      req = mockReq({});
      done();
    });

    itValidatesServices();
  });

  describe('when you pass an empty services paramter', function() {
    beforeEach(function(done) {
      req = mockReq({services: ''});
      done();
    });

    itValidatesServices();
  });
});
