var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , friends = require(path.join('services', 'foursquare', 'friends.js'))
  , checkins    = require(path.join('services', 'foursquare', 'checkins.js'))
  , self    = require(path.join('services', 'foursquare', 'self.js'))
  , recent    = require(path.join('services', 'foursquare', 'recent.js'))
  , util    = require('util')
  ;

describe("foursquare connector", function () {
  var pinfo;
  var apiBase = "https://api.foursquare.com:443/v2/users/";

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'foursquare.json'));
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe("self synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'self?v=20120413&oauth_token=token',
                           file : __dirname + '/../fixtures/synclets/foursquare/self.json'});
      return done();
    });

    it('can fetch self', function (done) {
      self.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['contact:72937@foursquare/self'][0].id.should.equal('72937');
        return done();
      });
    });
  });

  describe("friends synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'self/friends.json?oauth_token=token&limit=500',
                           file : __dirname + '/../fixtures/synclets/foursquare/friends.json'});
      fakeweb.registerUri({uri : 'https://api.foursquare.com:443/v2/multi?requests=/users/37,/users/476,/users/516,/users/618,/users/763,&oauth_token=token',
                           file : __dirname + '/../fixtures/synclets/foursquare/multi.json'});
      fakeweb.registerUri({uri : 'https://api.foursquare.com:443/v2/multi?requests=/users/1419,/users/2307,/users/2928,/users/9832,/users/11203,&oauth_token=token',
                           file : __dirname + '/../fixtures/synclets/foursquare/none.json'});
      return done();
    });

    it('can fetch friend information', function (done) {
      friends.sync(pinfo, function (err, response) {
        if (err && !response) return done(err);
        response.data['contact:42@foursquare/friends'][0].id.should.equal('37');
        return done();
      });
    });
  });

  describe("checkins synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'self/checkins.json?limit=250&offset=0&oauth_token=token&afterTimestamp=1',
                           file : __dirname + '/../fixtures/synclets/foursquare/checkins.json'});
      return done();
    });

    it('can fetch checkins', function (done) {
      pinfo.config = {};
      checkins.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['checkin:42@foursquare/checkins'][0].id.should.equal('4f8bfeefe4b01f95a53521b9');
        return done();
      });
    });
  });

  describe("recent synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'https://api.foursquare.com:443/v2/checkins/recent.json?limit=100&oauth_token=token',
                           file : __dirname + '/../fixtures/synclets/foursquare/recent.json'});
      return done();
    });

    it('can fetch recents', function (done) {
      pinfo.config = {};
      recent.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['checkin:42@foursquare/recent'][0].id.should.equal('4f8c3c3ae4b029818cd11a9d');
        return done();
      });
    });
  });

});
