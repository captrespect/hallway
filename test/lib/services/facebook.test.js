var mocha   = require('mocha');
var should  = require('should');
var fakeweb = require('node-fakeweb');
var path    = require('path');
var util    = require('util');
var helper  = require(path.join(__dirname, '..', '..', 'support', 'locker-helper.js'));
var feed    = require(path.join('services', 'facebook', 'feed.js'));
var friends = require(path.join('services', 'facebook', 'friends.js'));
var home    = require(path.join('services', 'facebook', 'home.js'));
var homeup  = require(path.join('services', 'facebook', 'home_update.js'));
var photos  = require(path.join('services', 'facebook', 'photos.js'));

describe("Facebook connector", function() {
  var apiBase = 'https://graph.facebook.com:443/me/';
  var pinfo;

  before(function (done) {
    fakeweb.allowNetConnect = false;
    return done();
  });

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(
      path.join(__dirname, '..', '..', 'fixtures', 'connectors', 'facebook.json')
    );
    pinfo.config = {};
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe('the feed synclet', function() {
    beforeEach(function(done) {
      fakeweb.registerUri({
        uri : apiBase + 'feed?limit=200&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/feed.json'
      });
      return done();
    });

    it('fetches your profile feed', function(done) {
      feed.sync(pinfo, function(err, response) {
        if (err) return done(err);
        response.data['post:42@facebook/feed'][0].id.
          should.equal('100002438955325_224550747571079');
        return done();
      });
    });

    describe('when there is more to fetch', function() {
      it('remembers the next page to fetch', function(done) {
        feed.sync(pinfo, function(err, response) {
          response.config.feedNext.should.equal(
            'https://graph.facebook.com/me/home?access_token=abc&date_format=U&limit=25&until=1306193396'
          );
          return done();
        });
      });

      it('schedules itself immediately', function(done) {
        feed.sync(pinfo, function(err, response) {
          response.config.nextRun.should.equal(-1);
          return done();
        });
      });
    });

    describe('when there is nothing left to fetch', function() {
      beforeEach(function(done) {
        fakeweb.registerUri({
          uri : apiBase + 'feed?limit=200&access_token=foo&date_format=U',
          body : '{"data":[]}'
        });
        return done();
      });

      it('does not schedule another run', function(done) {
        feed.sync(pinfo, function(err, response) {
          response.config.feedNext.should.equal(false);
          return done();
        });
      });
    });

  });

  describe("home synclet", function() {
    beforeEach(function (done) {
      fakeweb.registerUri({
        uri  : 'https://graph.facebook.com:443/?ids=3488997579924&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/photo.json'
      });
      fakeweb.registerUri({
        uri : apiBase + 'home?limit=200&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/home.json'
      });
      fakeweb.registerUri({
        uri : apiBase + 'feed?date_format=U&access_token=abc&limit=25&until=1305843879',
        body : '{"data":[]}'
      });

      return done();
    });

    it('can fetch news feed', function(done) {
      home.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['post:42@facebook/home'][0].id.
          should.equal('100002438955325_224550747571079');
        response.data['photo:42@facebook/home_photos'][0].id.
          should.equal('3488997579924');
        return done();
      });
    });

  });

  describe("home update synclet", function() {
    beforeEach(function (done) {
      fakeweb.registerUri({
        uri : apiBase + 'home?limit=500&since=yesterday&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/home.json'
      });
      fakeweb.registerUri({
        uri: 'https://graph.facebook.com:443/me/feed?limit=500&since=yesterday&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/home.json'
      });
      fakeweb.registerUri({
        uri : apiBase + 'feed?date_format=U&access_token=abc&limit=25&until=1305843879&since=yesterday',
        body : '{"data":[]}'
      });

      return done();
    });

    it('can update news feed', function(done) {
      homeup.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['post:42@facebook/home'][0].id.
          should.equal('100002438955325_105511996206765');
        return done();
      });
    });
  });

  describe('the photos synclet', function() {
    beforeEach(function(done) {
      fakeweb.registerUri({
        uri : 'https://graph.facebook.com:443/fql?q=SELECT%20object_id%2C%20modified%20FROM%20album%20WHERE%20owner%3Dme()%20AND%20modified%20%3E%200&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/albums.json'
      });
      fakeweb.registerUri({
        uri : 'https://graph.facebook.com:443/?ids=59354442594%2C10150465363772595&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/album.json'
      });
      fakeweb.registerUri({
        uri : 'https://graph.facebook.com:443/10150465363772595/photos?limit=500&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/photos.json'
      });
      fakeweb.registerUri({
        uri : 'https://graph.facebook.com:443/59354442594/photos?limit=500&access_token=foo&date_format=U',
        file : __dirname + '/../../fixtures/synclets/facebook/photos.json'
      });
      return done();
    });

    describe('when we have no albums to fetch', function() {
      it('fetches new albums', function(done) {
        photos.sync(pinfo, function(err, response) {
          if (err) return done(err);
          response.config.albums[0].object_id.should.equal(59354442594);
          response.config.albums[1].object_id.should.equal('10150465363772595');
          return done();
        });
      });
    });

    describe('when there are albume to fetch', function() {
      beforeEach(function(done) {
        pinfo.config.albums = helper.loadFixture(
          __dirname + '/../../fixtures/synclets/facebook/albums.json'
        ).data;
        return done();
      });

      it('fetches new photos', function(done) {
        photos.sync(pinfo, function(err, response) {
          if (err) return done(err);
          response.data['photo:42@facebook/photos'][0].id.
            should.equal('214713967594');
          return done();
        });
      });

      it('consumes an album', function(done) {
        photos.sync(pinfo, function(err, response) {
          if (err) return done(err);
          response.config.albums.length.should.equal(1);
          return done();
        });
      });

      it('schedules itself immediately', function(done) {
        photos.sync(pinfo, function(err, response) {
          if (err) return done(err);
          response.config.nextRun.should.equal(-1);
          return done();
        });
      });

      describe('when we fetch the last album', function() {
        beforeEach(function(done) {
          pinfo.config.albums.pop();
          return done();
        });

        it('does not run again', function(done) {
          photos.sync(pinfo, function(err, response) {
            if (err) return done(err);
            should.not.exist(response.config.nextRun);
            return done();
          });
        });
      });
    });
  });

});
