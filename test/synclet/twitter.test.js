var mocha    = require('mocha')
  , should   = require('should')
  , fakeweb  = require('node-fakeweb')
  , path     = require('path')
  , helper   = require(path.join(__dirname, '..', 'lib', 'locker-helper.js'))
  , friends  = require(path.join(__dirname, '..', '..', 'Connectors', 'Twitter', 'friends.js'))
  , timeline = require(path.join(__dirname, '..', '..', 'Connectors', 'Twitter', 'timeline.js'))
  , util     = require('util')
  ;

describe("twitter connector", function () {
  var apiBase = 'https://api.twitter.com:443/1/';
  var apiSuffix = '&include_entities=true';
  var pinfo;

  before(function (done) {
    fakeweb.allowNetConnect = false;
    helper.fakeTwitter(done);
  });

  beforeEach(function (done) {
    process.chdir(path.join(process.env.LOCKER_ROOT, process.env.LOCKER_ME, 'twitter'));
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'twitter.json'));
    pinfo.absoluteSrcdir = path.join(__dirname, '..', '..', 'Connectors', 'Twitter');
    return done();
  });

  after(function (done) {
    helper.teardownMe(null, done);
  });

  describe("friends synclet", function () {
    before(function (done) {
      fakeweb.registerUri({uri  : apiBase + 'friends/ids.json?cursor=-1&path=%2Ffriends%2Fids.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/friends.js' });
      fakeweb.registerUri({uri  : apiBase + 'users/lookup.json?path=%2Fusers%2Flookup.json&user_id=1054551' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/1054551.js' });

      return done();
    });

    it("can get users", function (done) {
     friends.sync(pinfo, function (err, response) {
       if (err) return done(err);

       response.data.contact[0].id.should.equal(1054551, 'response IDs should match');
       return done();
     });
    });
  });

  describe("timeline synclet", function () {
    before(function (done) {
      fakeweb.registerUri({uri  : apiBase + 'account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/verify_credentials.js' });
      fakeweb.registerUri({uri  : apiBase + 'statuses/home_timeline.json?screen_name=ctide&page=1&since_id=1&path=%2Fstatuses%2Fhome_timeline.json&count=200' + apiSuffix,
                           file : __dirname + '/../fixtures/synclets/twitter/home_timeline.js' });

      return done();
    });

    it("can fetch tweets", function (done) {
      timeline.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data.tweet[0].id_str.should.equal('71348168469643264');
        return done();
      });
    });
  });
});
