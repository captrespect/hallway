var mocha   = require('mocha')
  , should  = require('should')
  , fakeweb = require('node-fakeweb')
  , path    = require('path')
  , helper  = require(path.join(__dirname, '..', 'support', 'locker-helper.js'))
  , self = require(path.join('services', 'linkedin', 'self.js'))
  , updates    = require(path.join('services', 'linkedin', 'updates.js'))
  , util    = require('util')
  ;

describe("linkedin connector", function () {
  var pinfo;

  beforeEach(function (done) {
    fakeweb.allowNetConnect = false;
    pinfo = helper.loadFixture(path.join(__dirname, '..', 'fixtures', 'connectors', 'linkedin.json'));
    return done();
  });

  afterEach(function (done) {
    fakeweb.tearDown();
    return done();
  });

  describe("self synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'http://api.linkedin.com:80/v1/people/~:(id,first-name,last-name,headline,location:(name,country:(code)),industry,current-share,num-connections,summary,specialties,proposal-comments,associations,honors,interests,positions,publications,patents,languages,skills,certifications,educations,num-recommenders,recommendations-received,phone-numbers,im-accounts,twitter-accounts,date-of-birth,main-address,member-url-resources,picture-url,site-standard-profile-request:(url),api-standard-profile-request:(url),site-public-profile-request:(url),api-public-profile-request:(url),public-profile-url)?format=json',
      headers:{"Content-Type":"text/plain"},
                           file : __dirname + '/../fixtures/synclets/linkedin/self.json'});
      return done();
    });

    it('can fetch profile information', function (done) {
      self.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['profile:42@linkedin/self'][0].id.should.equal("42");
        return done();
      });
    });
  });

  describe("updates synclet", function () {
    beforeEach(function (done) {
      fakeweb.registerUri({uri : 'http://api.linkedin.com:80/v1/people/~/network/updates?format=json&scope=self&count=250',
      headers:{"Content-Type":"text/plain"},
                           file : __dirname + '/../fixtures/synclets/linkedin/updates.json'});

      return done();
    });

    it('can fetch updates', function (done) {
      updates.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['update:42@linkedin/updates'][0].updateKey.should.equal("UNIU-148054073-5606400884670988288-SHARE");
        return done();
      });
    });
  });

});
