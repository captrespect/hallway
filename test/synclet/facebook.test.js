var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , friends = require(path.join('services', 'facebook', 'friends.js'))
  , home    = require(path.join('services', 'facebook', 'home.js'))
  , homeup    = require(path.join('services', 'facebook', 'home_update.js'))
  , photos  = require(path.join('services', 'facebook', 'photos.js'))
  , util    = require('util')
  ;

describe("Facebook connector", function () {
  var apiBase = 'https://graph.facebook.com:443/me/'
    , pinfo;

  before(function (done) {
    fakeweb.allowNetConnect = false;
    return done();
  });

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'facebook.json'));
    pinfo.config = {};
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe("friends synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'friends?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/friends2.json'});
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/1234?access_token=foo&date_format=U&' +
                                 'fields=id,name,first_name,middle_name,last_name,' +
                                 'gender,locale,languages,link,username,third_party_id,timezone,' +
                                 'updated_time,verified,bio,birthday,education,email,hometown,' +
                                 'interested_in,location,political,favorite_athletes,favorite_teams,' +
                                 'quotes,relationship_status,religion,significant_other,video_upload_limits,website,work',
                           file : __dirname + '/../fixtures/synclets/facebook/1234.json' });
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/1234/picture?access_token=foo',
                           file : __dirname + '/../fixtures/synclets/facebook/1234.jpg',
                           contentType : 'image/jpeg'});

      return done();
    });

    it('can fetch friend information', function (done) {
      friends.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['contact:42@facebook/friends'][0].id.should.equal('1234');
        return done();
      });
    });
  });

  describe("home synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/3488997579924?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/photo.json'});
      fakeweb.registerUri({uri : apiBase + 'home?access_token=foo&date_format=U&limit=100',
                           file : __dirname + '/../fixtures/synclets/facebook/home.json'});
      fakeweb.registerUri({uri : apiBase + 'feed?date_format=U&access_token=abc&limit=25&until=1305843879',
                           body : '{"data":[]}'});

      return done();
    });

    it('can fetch news feed', function (done) {
      home.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['post:42@facebook/home'][0].id.should.equal('100002438955325_224550747571079');
        response.data['photo:42@facebook/home_photos'][0].id.should.equal('3488997579924');
        return done();
      });
    });

  });

  describe("home update synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + 'home?access_token=foo&date_format=U&since=yesterday&limit=100',
                           file : __dirname + '/../fixtures/synclets/facebook/home.json'});
      fakeweb.registerUri({uri : apiBase + 'feed?date_format=U&access_token=abc&limit=25&until=1305843879&since=yesterday',
                           body : '{"data":[]}'});

      return done();
    });

    it('can update news feed', function (done) {
      homeup.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['post:42@facebook/home'][0].id.should.equal('100002438955325_105511996206765');
        return done();
      });
    });
  });

  describe("photos synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/10150465363772595/photos?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/photos.js'});
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/10150465363772595?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/album.json'});
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/59354442594?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/album.json'});
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/113387497594/photos?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/photos.js'});
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/fql?q=SELECT%20object_id%2C%20modified%20FROM%20album%20WHERE%20owner%3Dme()%20AND%20modified%20%3E%200&access_token=foo',
                           file : __dirname + '/../fixtures/synclets/facebook/albums.js'});
      fakeweb.registerUri({uri : apiBase + 'photos?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/photos.js'});

      return done();
    });

    it('can fetch photo albums', function (done) {
      photos.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['album:42@facebook/albums'][0].id.should.equal('59354442594');
        response.config.albums[0].since.should.equal(0);
        return done();
      });
    });

    it('can fetch photos', function (done) {
      photos.sync(pinfo, function (err, response) {
        if (err) return done(err);

        // now that the list of albums is populated, fetch the actual list of photos
        photos.sync(response, function (err, response) {
          if (err) return done(err);

          response.data['photo:42@facebook/photos'][0].id.should.equal('214713967594');
          return done();
        });
      });
    });
  });
});
