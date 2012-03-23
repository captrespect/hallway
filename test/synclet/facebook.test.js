var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'lib', 'locker-helper.js'))
  , friends = require(path.join(__dirname, '..', '..', 'Connectors', 'Facebook', 'friends.js'))
  , home    = require(path.join(__dirname, '..', '..', 'Connectors', 'Facebook', 'home.js'))
  , photos  = require(path.join(__dirname, '..', '..', 'Connectors', 'Facebook', 'photos.js'))
  , util    = require('util')
  ;

describe("Facebook connector", function () {
  var apiBase = 'https://graph.facebook.com:443/me/'
    , pinfo;

  before(function (done) {
    fakeweb.allowNetConnect = false;
    helper.fakeFacebook(done);
  });

  after(function (done) {
    helper.teardownMe(null, done);
  });

  beforeEach(function (done) {
    process.chdir(path.join(process.env.LOCKER_ROOT, process.env.LOCKER_ME, 'facebook'));
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'facebook.json'));
    pinfo.absoluteSrcdir = path.join(__dirname, '..', '..', 'Connectors', 'Facebook');
    return done();
  });

  describe("friends synclet", function () {
    before(function (done) {
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

        response.data.contact[0].id.should.equal('1234');
        return done();
      });
    });
  });

  describe("home synclet", function () {
    before(function (done) {
      fakeweb.registerUri({uri : apiBase + 'home?access_token=foo&date_format=U&limit=100',
                           file : __dirname + '/../fixtures/synclets/facebook/home.json'});
      fakeweb.registerUri({uri : apiBase + 'feed?date_format=U&access_token=abc&limit=25&until=1305843879',
                           body : '{"data":[]}'});

      return done();
    });

    it('can fetch news feed', function (done) {
      home.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data.home[0].id.should.equal('100002438955325_224550747571079');
        return done();
      });
    });
  });

  describe("photos synclet", function () {
    before(function (done) {
      fakeweb.registerUri({uri : 'https://graph.facebook.com:443/427822997594/photos?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/photos.js'});
      fakeweb.registerUri({uri : apiBase + 'albums?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/albums.js'});
      fakeweb.registerUri({uri : apiBase + 'photos?access_token=foo&date_format=U',
                           file : __dirname + '/../fixtures/synclets/facebook/photos.js'});

      return done();
    });

    it('can fetch photo albums', function (done) {
      photos.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.config.albums[0].cover_photo.should.equal('214713967594');
        return done();
      });
    });

    it('can fetch photos', function (done) {
      photos.sync(pinfo, function (err, response) {
        if (err) return done(err);

        // now that the list of albums is populated, fetch the actual list of photos
        photos.sync(response, function (err, response) {
          if (err) return done(err);

          response.data.photo[0].id.should.equal('214713967594');
          return done();
        });
      });
    });
  });
});
