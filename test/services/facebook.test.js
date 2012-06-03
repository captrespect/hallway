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

  describe("home synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/?access_token=foo&date_format=U&ids=3488997579924',
                           file : __dirname + '/../fixtures/synclets/facebook/photo.json'});
      fakeweb.registerUri({uri : apiBase + 'home?access_token=foo&date_format=U&limit=200',
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
      fakeweb.registerUri({uri : apiBase + 'home?access_token=foo&date_format=U&since=yesterday&limit=500',
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

});
