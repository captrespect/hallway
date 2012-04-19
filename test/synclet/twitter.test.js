var mocha    = require('mocha')
  , should   = require('should')
  , fakeweb  = require('node-fakeweb')
  , path     = require('path')
  , helper   = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , friends  = require(path.join(__dirname, '..', '..', 'Connectors', 'twitter', 'friends.js'))
  , timeline = require(path.join(__dirname, '..', '..', 'Connectors', 'twitter', 'timeline.js'))
  , mentions = require(path.join(__dirname, '..', '..', 'Connectors', 'twitter', 'mentions.js'))
  , tweets   = require(path.join(__dirname, '..', '..', 'Connectors', 'twitter', 'tweets.js'))
  , util     = require('util')
  ;

describe("Twitter connector", function () {
  var apiBase = 'https://api.twitter.com:443/1/'
    , apiSuffix = '&include_entities=true'
    , pinfo;

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'twitter.json'));
    pinfo.absoluteSrcdir = path.join(__dirname, '..', '..', 'Connectors', 'twitter');
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe("friends synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri  : apiBase + 'friends/ids.json?cursor=-1&path=%2Ffriends%2Fids.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/friends.js'});
      fakeweb.registerUri({uri  : apiBase + 'users/lookup.json?path=%2Fusers%2Flookup.json&user_id=1054551' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/1054551.js'});

      return done();
    });

    it("can get contacts", function (done) {
     friends.sync(pinfo, function (err, response) {
       if (err) return done(err);

       response.data["contact:ctide@twitter/friends"][0].id.should.equal(1054551, 'response IDs should match');
       return done();
     });
    });
  });

  describe("timeline synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri  : apiBase + 'account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/verify_credentials.js'});
      fakeweb.registerUri({uri  : apiBase + 'statuses/home_timeline.json?screen_name=ctide&page=1&since_id=1&path=%2Fstatuses%2Fhome_timeline.json&count=200' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/home_timeline.js'});

      return done();
    });

    it("can fetch tweets", function (done) {
      timeline.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data["tweet:ctide@twitter/timeline"][0].id_str.should.equal('71348168469643264');
        return done();
      });
    });
  });

  describe("mentions synclet", function() {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/verify_credentials.js'});
      fakeweb.registerUri({uri : apiBase + 'statuses/mentions.json?screen_name=ctide&page=1&since_id=1&path=%2Fstatuses%2Fmentions.json&count=200' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/home_timeline.js'});
      return done();
    });

    it("can fetch mentions", function (done) {
      mentions.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data["tweet:ctide@twitter/mentions"][0].id_str.should.equal('71348168469643264');
        return done();
      });
    });
  });

  describe("tweets synclet", function() {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/verify_credentials.js'});
      fakeweb.registerUri({uri : apiBase + 'statuses/user_timeline.json?screen_name=ctide&page=1&since_id=1&path=%2Fstatuses%2Fuser_timeline.json&include_rts=true&count=200' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/home_timeline.js'});
      return done();
    });

    it("can fetch tweets", function (done) {
      tweets.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data["tweet:ctide@twitter/tweets"][0].id_str.should.equal('71348168469643264');
        return done();
      });
    });
  });
});
