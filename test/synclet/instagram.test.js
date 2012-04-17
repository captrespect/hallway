var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , follows = require(path.join(__dirname, '..', '..', 'Connectors', 'instagram', 'follows.js'))
  , feed    = require(path.join(__dirname, '..', '..', 'Connectors', 'instagram', 'feed.js'))
  , util    = require('util')
  ;

describe("Instagram connector", function () {
  var pinfo;
  var apiBase = "https://api.instagram.com:443/v1/";

  before(function (done) {
    fakeweb.allowNetConnect = false;
    helper.fakeInstagram(function () {
      process.chdir(path.join(process.env.LOCKER_ROOT, process.env.LOCKER_ME, 'instagram'));
      return done();
    });
  });

  beforeEach(function (done) {
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'instagram.json'));
    pinfo.absoluteSrcdir = path.join(__dirname, '..', '..', 'Connectors', 'instagram');
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  after(function (done) {
    process.chdir(process.env.LOCKER_ROOT);
    helper.teardownMe(null, done);
  });

  describe("follows synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + '/users/self/follows?access_token=token',
                           file : __dirname + '/../fixtures/synclets/instagram/follows.json'});
      return done();
    });

    it('can fetch friend information', function (done) {
      follows.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['contact:42@instagram/follows'][0].id.should.equal('8327977');
        return done();
      });
    });
  });

  describe("feed synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : apiBase + '/users/self/feed?access_token=token',
                           file : __dirname + '/../fixtures/synclets/instagram/feed.json'});

      return done();
    });

    it('can fetch feed', function (done) {
      pinfo.config = {};
      feed.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['photo:42@instagram/feed'][0].id.should.equal('166833681386450342_1802');
        return done();
      });
    });
  });

});
