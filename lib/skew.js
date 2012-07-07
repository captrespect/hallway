var fivebeans = require('fivebeans');
var redis = require('redis');
var util = require('util');

var DEFAULT_TTR = 10 * 60;

function Skew(servers, identifier) {
  this.redisClient = redis.createClient(servers.redis.port, servers.redis.host);
  this.beanstalkClient = new fivebeans.client(servers.beanstalk.host, servers.beanstalk.port);

  this.identifier = identifier;
}

Skew.prototype.init = function(callback) {
  this.beanstalkClient.connect(function(err) {
    callback(err);
  });
};

Skew.prototype.trackRedisJob = function(jobId, callback) {
  var self = this;

  self.redisClient.multi()
    .sadd('working', jobId)
    .sadd('working:' + self.identifier, jobId)
    .exec(function(err, replies) {
      if (err || !replies) {
        callback(err, false);
      }

      var i;
      for (i = 0; i < replies.length; i++) {
        if (replies[i] === 0) {
          return callback('The job was already tracked.', false);
        }
      }

      callback(err, true);
    });
};

Skew.prototype.deleteRedisJob = function(jobId, callback) {
  var self = this;

  self.redisClient.multi()
    .srem('working', jobId)
    .srem('working:' + self.identifier, jobId)
    .exec(function(err, replies) {
      if (err || !replies) {
        callback(err, false);
      }

      var i;
      for (i = 0; i < replies.length; i++) {
        if (replies[i] === 0) {
          return callback("The job wasn't tracked.", false);
        }
      }

      callback(err, true);
    });
};

Skew.prototype.isJobRunning = function(jobId, callback) {
  this.redisClient.sismember('working', jobId, function(err, reply) {
    callback(err, reply === 1);
  });
};

// TODO: Specify TTR as an argument?
Skew.prototype.schedule = function(priority, nextRun, payload, callback) {
  var self = this;

  // If nextRun is in the future then delay this job accordingly
  var delay = Math.floor(Math.abs(Math.min((Date.now() - nextRun) / 1000, 0)));

  if (payload === null) {
    return callback('Payload was null.');
  }

  if (typeof payload === 'object') {
    payload = JSON.stringify(payload);
  }

  console.log(priority, delay, DEFAULT_TTR, payload);

  self.beanstalkClient.put(priority, delay, DEFAULT_TTR, payload, function(err, jobId) {
    if (err || !jobId) {
      return callback(err);
    }

    // TODO: Put things here
    self.redisClient.hmset('job:' + jobId, {
      nextRun: nextRun
    },
    function(err, reply) {
      callback(err, jobId);
    });
  });
};

Skew.prototype.reserve = function(callback) {
  var self = this;

  self.beanstalkClient.reserve(function(err, jobId, payload) {
    if (err || !jobId) {
      return callback(err);
    }

    payload = JSON.parse(payload);

    self.trackRedisJob(jobId, function(err, result) {
      callback(err, jobId, payload);
    });
  });
};

Skew.prototype.release = function(jobId, priority, delay, callback) {
  var self = this;

  self.beanstalkClient.release(jobId, priority, delay, function(err) {
    if (err) {
      return callback(err);
    }

    self.deleteRedisJob(jobId, callback);
  });
};

Skew.prototype.destroy = function(jobId, callback) {
  var self = this;

  self.beanstalkClient.destroy(jobId, function(err) {
    if (err) {
      return callback(err);
    }

    self.deleteRedisJob(jobId, callback);
  });
};

exports.client = Skew;
