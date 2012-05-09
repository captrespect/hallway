var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , following = require(path.join('services', 'tumblr', 'following.js'))
  , posts    = require(path.join('services', 'tumblr', 'posts.js'))
  , util    = require('util')
  ;

describe("tumblr connector", function () {
  var pinfo;

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'tumblr.json'));
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe("following synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'http://api.tumblr.com:80/v2/blog/www.davidslog.com/info?path=%2Fblog%2Fwww.davidslog.com%2Finfo&field=blog&api_key=',
                           file : __dirname + '/../fixtures/synclets/tumblr/blog.json'});
      fakeweb.registerUri({uri : 'http://api.tumblr.com:80/v2/user/following?path=%2Fuser%2Ffollowing&field=blogs&offset=0&limit=50',
                           file : __dirname + '/../fixtures/synclets/tumblr/following.json'});
      return done();
    });

    it('can fetch blog information', function (done) {
      following.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['blog:42@tumblr/following'][0].name.should.equal('david');
        return done();
      });
    });
  });

  describe("posts synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'http://api.tumblr.com:80/v2/blog/foo/posts?offset=0&path=%2Fblog%2Ffoo%2Fposts&field=posts&reblog_info=true&notes_info=true&limit=50&api_key=',
                           file : __dirname + '/../fixtures/synclets/tumblr/posts.json'});

      return done();
    });

    it('can fetch posts', function (done) {
      pinfo.config = {};
      posts.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['post:42@tumblr/posts'][0].id.should.equal(3507845453);
        return done();
      });
    });
  });

});
