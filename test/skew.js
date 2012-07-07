var assert = require("chai").assert;
var skew = require("skew");

describe('Skew', function() {
  var client;

  before(function(done) {
    client = new skew.client({
      redis: {
        host: 'localhost',
        port: 6379
      },
      beanstalk: {
        host: 'localhost',
        port: 11300
      }
    }, 'testing');

    client.init(function(err) {
      // Use a non-default database
      client.redisClient.select(1, function() {
        // Use a non-default tube
        client.beanstalkClient.use(Date.now().toString(36), function(err, tubename) {
          assert.isNull(err);

          done();
        });
      });
    });
  });

  beforeEach(function(done) {
    // Flush the database between each test
    client.redisClient.flushdb(function() {
      done();
    });
  });

  describe('#reserve()', function() {
    it('should reserve a job', function(done) {
      client.schedule(0, Date.now() - (60 * 1000), { a: 'b', c: 'd' }, function(err, jobId) {
        assert.isNull(err);
        assert.isString(jobId);
        assert.isTrue(parseInt(jobId, 10) > 0);

        client.reserve(function(err, jobId, payload) {
          assert.isNull(err);
          assert.isString(jobId);
          assert.isTrue(parseInt(jobId, 10) > 0);

          assert.isObject(payload);

          assert.isTrue(payload.a === 'b');
          assert.isTrue(payload.c === 'd');

          done();
        });
      });
    });
  });

  describe('#schedule()', function() {
    it('should schedule a valid job', function(done) {
      client.schedule(0, Date.now() + (60 * 1000), { a: 'b', c: 'd' }, function(err, jobId) {
        assert.isNull(err);
        assert.isString(jobId);
        assert.isTrue(parseInt(jobId, 10) > 0);

        done();
      });
    });
  });

  describe('#deleteRedisJob()', function() {
    it('should return false when the job is not tracked', function(done) {
      client.deleteRedisJob(12345, function(err, result) {
        assert.equal("The job wasn't tracked.", err);
        assert.equal(false, result);

        done();
      });
    });

    it('should return true when the job was successfully deleted', function(done) {
      client.trackRedisJob(12345, function(err, result) {
        assert.equal(undefined, err);
        assert.equal(true, result);

        client.deleteRedisJob(12345, function(err, result) {
          assert.equal(undefined, err);
          assert.equal(true, result);

          client.isJobRunning(12345, function(err, result) {
            assert.equal(undefined, err);
            assert.equal(false, result);

            done();
          });
        });
      });
    });
  });

  describe('#trackRedisJob()', function() {
    it('should return false when the job is already tracked', function(done) {
      client.trackRedisJob(12345, function(err, result) {
        assert.equal(undefined, err);
        assert.equal(true, result);

        client.trackRedisJob(12345, function(err, result) {
          assert.equal('The job was already tracked.', err);
          assert.equal(false, result);

          done();
        });
      });
    });

    it('should return true when the job was successfully tracked', function(done) {
      client.trackRedisJob(12345, function(err, result) {
        assert.equal(undefined, err);
        assert.equal(true, result);

        client.isJobRunning(12345, function(err, running) {
          assert.equal(undefined, err);
          assert.equal(true, running);

          done();
        });
      });
    });
  });

  describe('#isJobRunning()', function() {
    it('should return false when the job is not running', function(done) {
      client.isJobRunning(12345, function(err, running) {
        assert.equal(undefined, err);
        assert.equal(false, running);

        done();
      });
    });

    it('should return true when the job is running', function(done) {
      client.trackRedisJob(12345, function(err, result) {
        assert.equal(undefined, err);
        assert.equal(true, result);

        client.isJobRunning(12345, function(err, running) {
          assert.equal(undefined, err);
          assert.equal(true, running);

          done();
        });
      });
    });
  });
});
