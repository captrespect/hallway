var mocha   = require('mocha');
var should  = require('should');

var map = require('services/facebook/map');

describe('GUIDs', function() {
  var entry;

  describe('photos', function() {
    describe('from Instagram', function() {
      beforeEach(function(done) {
        entry = {data: {name: 'From http://instagr.am/p/123/'}};
        done();
      });

      it('generates the right GUID', function(done) {
        map.guid.photo(entry).should.equal('guid:instagram/#123');
        done();
      });
    });

    describe('not from Instagram', function() {
      beforeEach(function(done) {
        entry = {data: {name: ''}};
        done();
      });

      it('does not have a GUID', function(done) {
        should.not.exist(map.guid.photo(entry));
        done();
      });
    });
  });

  describe('posts', function() {
    describe('without any cross-posting', function() {
      beforeEach(function(done) {
        entry = {data: {}};
        done();
      });

      it('does not have a GUID', function(done) {
        should.not.exist(map.guid.post(entry));
        done();
      });
    });

    describe('linking to Instagram', function() {
      beforeEach(function(done) {
        entry = {refs: {
          'http://instagr.am/p/123/': true
        }};
        done();
      });

      it('generates the right GUID', function(done) {
        map.guid.post(entry).should.equal('guid:instagram/#123');
        done();
      });
    });

    describe('linking to Foursquare', function() {
      beforeEach(function(done) {
        entry = {refs: {
          'http://foursquare.com/kristjan/checkin/123': true
        }};
        done();
      });

      it('generates the right GUID', function(done) {
        map.guid.post(entry).should.equal('guid:foursquare/#123');
        done();
      });
    });

    describe('via Twitter', function() {
      beforeEach(function(done) {
        entry = {
          data: {
            application: {name: 'Twitter'},
            actions: [{name: '@kripet on Twitter'}],
            message: 'Rockin Robin'
          }
        };
        done();
      });

      it('generates the right GUID', function(done) {
        map.guid.post(entry).
          should.equal('guid:kripet@twitter/#ff3420b9d5480411e1cc9db7a202bf56');
        done();
      });
    });

    describe('via Foursquare', function() {
      beforeEach(function(done) {
        entry = {
          data: {
            application: {name: 'foursquare'},
            link: 'http://foursquare.com/kristjan/checkin/123'
          }
        };
        done();
      });

      it('generates the right GUID', function(done) {
        map.guid.post(entry).should.equal('guid:foursquare/#123');
        done();
      });
    });
  });
});
