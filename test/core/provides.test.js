var request = require('request')
  , should  = require('should')
  , mocha   = require('mocha')
  , path    = require('path')
  , async   = require('async')
  , helper  = require(path.join(__dirname, '..', 'lib', 'locker-helper.js'))
  ;

describe("the list of event types", function () {
  var provides;

  before(function (done) {
    return async.series([helper.fakeTwitter,
                         helper.fakeFacebook,
                         helper.fakeGithub,
                         helper.bootstrap],
                        done);
  });

  beforeEach(function (done) {
    request('http://localhost:8043/provides', function (error, response, body) {
      if (error) return done(error);

      response.should.be.ok;

      provides = JSON.parse(body);
      should.exist(provides);

      return done();
    });
  });

  after(function (done) {
    return helper.shutdown(done);
  });

  describe("Foursquare events", function () {
    it("should be described", function (done) {
      should.exist(provides.foursquare);
      return done();
    });

    it("should provide contacts", function (done) {
      provides.foursquare.should.include('contact/foursquare', "Foursquare connector should provide contacts.");
      return done();
    });

    it("should provide profiles", function (done) {
      provides.foursquare.should.include('profile/foursquare', "Foursquare connector should provide profiles.");
      return done();
    });

    it("should provide recents", function (done) {
      provides.foursquare.should.include('recents/foursquare', "Foursquare connector should provide recents.");
      return done();
    });

    it("should provide checkins", function (done) {
      provides.foursquare.should.include('checkin/foursquare', "Foursquare connector should provide checkins.");
      return done();
    });

    it("should provide badges", function (done) {
      provides.foursquare.should.include('badges/foursquare', "Foursquare connector should provide badges.");
      return done();
    });
  });
});
