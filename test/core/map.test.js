var request = require('request')
  , should  = require('should')
  , mocha   = require('mocha')
  , path    = require('path')
  , async   = require('async')
  , helper  = require(path.join(__dirname, '..', 'lib', 'locker-helper.js'))
  ;

describe("the service map", function () {
  var map;

  before(function (done) {
    return async.series([helper.fakeTwitter,
                         helper.fakeFacebook,
                         helper.fakeGithub,
                         helper.bootstrap],
                        done);
  });

  beforeEach(function (done) {
    request('http://localhost:8043/map', function (error, response, body) {
      if (error) return done(error);

      response.should.be.ok;

      map = JSON.parse(body);
      should.exist(map);

      return done();
    });
  });

  after(function (done) {
    return helper.shutdown(done);
  });

  it("should have information about the Twitter connector", function (done) {
      should.exist(map.twitter, 'Twitter is on the map');
      should.exist(map.twitter.authed, 'Twitter is authed');
      map.twitter.authed.should.be.above(0);
      map.twitter.type.should.equal('connector');

      return done();
  });

  it("should have information about the Facebook connector", function (done) {
      should.exist(map.facebook, 'Facebook is on the map');
      should.exist(map.facebook.authed, 'Facebook is authed');
      map.facebook.authed.should.be.above(0);
      map.facebook.type.should.equal('connector');

      return done();
  });

  it("should have information about the GitHub connector", function (done) {
      should.exist(map.github, 'github is on the map');
      should.exist(map.github.authed, 'github is authed');
      map.github.authed.should.be.above(0);
      map.github.type.should.equal('connector');

      return done();
  });
});
