var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'lib', 'locker-helper.js'))
  , friends = require(path.join(__dirname, '..', '..', 'Connectors', 'Twitter', 'friends'))
  ;

describe('twitter connector', function () {
  var apiBase = 'https://api.twitter.com:443/1';
  var apiSuffix = '&include_entities=true';
  var pinfo;

  before(function (done) {
    fakeweb.allowNetConnect = false;
    helper.fakeTwitter(done);
  });

  after(function (done) {
    helper.teardownMe(null, done);
  });

  describe('friends synclet', function () {
    before(function (done) {
      fakeweb.registerUri({uri  : apiBase + '/account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/verify_credentials.js' });
      fakeweb.registerUri({uri  : apiBase + '/friends/ids.json?screen_name=ctide&cursor=-1&path=%2Ffriends%2Fids.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/friends.js' });
      fakeweb.registerUri({uri  : apiBase + '/users/lookup.json?path=%2Fusers%2Flookup.json&user_id=1054551' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/1054551.js' });
      fakeweb.registerUri({uri  : 'http://a0.twimg.com:80/profile_images/299352843/Picture_82_normal.png',
                           file : __dirname + '/../fixtures/synclets/twitter/1054551.png',
                           contentType : 'image/png' });

      return done();
    });

    beforeEach(function (done) {
      process.chdir(path.join(process.env.LOCKER_ROOT, process.env.LOCKER_ME, 'twitter'));
      pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'twitter.json'));
      pinfo.absoluteSrcdir = path.join(__dirname, '..', '..', 'Connectors', 'Twitter');
      return done();
    });

    it("can get users", function (done) {
     friends.sync(pinfo, function (err, response) {
       if (err) return done(err);

       response.data.contact[0].obj.id.should.equal(1054551, 'response IDs should match');
       return done();
     });
    });
  });
});
