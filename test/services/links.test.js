var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , resolve = require(path.join('services', 'links', 'resolve.js'))
  , util    = require('util')
  ;

describe("links services", function () {
  var tweets = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'synclets', 'twitter', 'home_timeline.js'));
  var entry = {data:tweets[0], idr:'tweet:42@twitter/timeline#71348168469643264'};

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe("resolver pump", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'http://bit.ly:80/jBrrAe', body:'' });
      fakeweb.registerUri({uri : 'http://bit.ly:80/jO9Pfy', body:'' });
      return done();
    });

    it('can resolve stuff', function (done) {
      resolve.pump([entry], function (err, set) {
        if (err) return done(err);
        Object.keys(set[0].refs).length.should.equal(2);
        "42".should.equal("69");
        return done();
      });
    });
  });


});
