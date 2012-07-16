var genericPool = require('generic-pool');
var fivebeans = require('fivebeans');
var redis = require('redis');

var DEFAULT_REDIS_EXPIRY = 5 * 60;
var DEFAULT_JOB_TTR = 10 * 60;

function Skew(servers, identifier) {
  this.redisClient = redis.createClient(servers.redis.port, servers.redis.host);

  // XXX: fivebeans isn't thread-safe so we fake it with a generic-pool with max: 1
  //      beanstalkd also requires that the client that destroys a job is the one that reserved it.
  this.beanstalkPool = genericPool.Pool({
    name: "beanstalk",
    create: function(callback) {
      console.log("Creating a beanstalk client");

      var beanstalk = new fivebeans.client(servers.beanstalk.host, servers.beanstalk.port);

      beanstalk.connect(function(err) {
        callback(err, beanstalk);
      });
    },
    destroy: function(client) {
      console.log("Destroying a beanstalk client");
    },
    min: 1,
    max: 1,
    idleTimeoutMillis: 25000
  });

  this.identifier = identifier;
}

Skew.prototype.isFilled = function(callback) {
  this.redisClient.get('filled', function(err, reply) {
    // Return true if the filled key is set
    callback(err, reply !== null);
  });
};

// TODO: Set the worker name? Or use node-mutex?
Skew.prototype.getFillLock = function(callback) {
  var self = this;

  // Acquire the lock only if it isn't held by someone else
  self.redisClient.setnx('lock:fill', Date.now() + (30 * 60 * 1000), function(err, reply) {
    if (err) {
      return callback(err);
    }

    // The lock is held by someone else, check if it's expired
    if (reply === 0) {
      self.redisClient.get('lock:fill', function(err, reply) {
        // Is it expired?
        if (parseInt(reply, 10) <= Date.now()) {
          // Set the expiration and get the old value (to make sure another worker didn't beat us)
          self.redisClient.getset('lock:fill', Date.now() + (30 * 60 * 1000), function(err, reply) {
            // If the old value is still expired then we now hold the lock
            return callback(err, parseInt(reply, 10) <= Date.now());
          });
        } else {
          return callback(err, false);
        }
      });
    } else {
      // Return true if we got the lock
      callback(err, true);
    }
  });
};

Skew.prototype.releaseFillLock = function(callback) {
  this.redisClient.del('lock:fill', function(err, reply) {
    // Return true if the lock still existed and we deleted it
    callback(err, reply === 1);
  });
};

Skew.prototype.trackRedisJob = function(key, callback) {
  var self = this;

  self.redisClient.multi()
    .sadd('working', key)
    .sadd('working:' + self.identifier, key)
    .exec(function(err, replies) {
      if (err || !replies) {
        callback(err, false);
      }

      var i;
      for (i = 0; i < replies.length; i++) {
        if (replies[i] === 0) {
          return callback("The job '" + key + "' was already tracked", false);
        }
      }

      callback(err, true);
    });
};

Skew.prototype.untrackRedisJob = function(key, callback) {
  var self = this;

  self.redisClient.multi()
    .srem('working', key)
    .srem('working:' + self.identifier, key)
    .exec(function(err, replies) {
      if (err || !replies) {
        callback(err, false);
      }

      var i;
      for (i = 0; i < replies.length; i++) {
        if (replies[i] === 0) {
          return callback("The job '" + key + "' wasn't tracked", false);
        }
      }

      callback(err, true);
    });
};

Skew.prototype.clearWorkerJobs = function(callback) {
  var self = this;

  // Remove this worker's jobs from these sets: working, working:identifier
  self.redisClient.smembers('working:' + self.identifier, function(err, replies) {
    if (err || !replies) {
      callback(err);
    }

    var multi = self.redisClient.multi();

    replies.forEach(function(reply) {
      multi.srem('working', replies[i]);
    });

    multi.exec(function(err, replies) {
      self.redisClient.del('working:' + self.identifier, function(err, reply) {
        callback(err, replies.length);
      });
    });
  });
};

Skew.prototype.isJobRunning = function(key, callback) {
  this.redisClient.sismember('working', key, function(err, reply) {
    // Return true if the key is a member of the working set
    callback(err, reply === 1);
  });
};

Skew.prototype.updateState = function(key, state, callback) {
  this.redisClient.hset('jobs:' + key, 'state', state, function(err, reply) {
    callback(err);
  });
};

Skew.prototype.incrementErrors = function(key, callback) {
  // TODO, currently unused
};

// TODO: Maybe this could just take a task?
Skew.prototype.schedule = function(key, nextRun, payload, priority, callback) {
  var self = this;

  // If nextRun is in the future then delay this job accordingly
  var delay = Math.floor(Math.abs(Math.min((Date.now() - nextRun) / 1000, 0)));

  if (payload === null || typeof payload !== 'object') {
    return callback('Payload was null or not an object.');
  }

  // Store the priority in the task because beanstalkd
  // doesn't return it when we reserve a job
  payload.priority = priority;

  payload = JSON.stringify(payload);

  self.beanstalkPool.acquire(function(err, beanstalk) {
    if (err)
      return callback(new Error(err));

    beanstalk.put(priority, delay, DEFAULT_JOB_TTR, payload, function(err, jobId) {
      self.beanstalkPool.release(beanstalk);

      if (err || !jobId) {
        return callback(err);
      }

      self.redisClient.hmset('jobs:' + key, {
        nextRun: nextRun
      },
      function(err, reply) {
        callback(err, jobId);
      });
    });
  });
};

Skew.prototype.reserve = function(callback) {
  var self = this;

  self.beanstalkPool.acquire(function(err, beanstalk) {
    if (err)
      return callback(new Error(err));

    beanstalk.reserve(function(err, jobId, payload) {
      self.beanstalkPool.release(beanstalk);

      if (err || !jobId) {
        return callback(err);
      }

      payload = JSON.parse(payload);

      // XXX/BAG: This is the same as syncManager.getKey
      var key = payload.profile + "/" + payload.synclet.name;

      self.trackRedisJob(key, function(err, result) {
        callback(err, jobId, payload);
      });
    });
  });
};

// TODO: Maybe this could just take a task?
Skew.prototype.release = function(key, jobId, priority, delay, callback) {
  var self = this;

  console.log('key', key, 'jobId', jobId, 'delay', delay);

  self.untrackRedisJob(key, function(err) {
    self.beanstalkPool.acquire(function(err, beanstalk) {
      if (err)
        return callback(new Error(err));

      beanstalk.release(jobId, priority, delay, function(err) {
        self.beanstalkPool.release(beanstalk);

        callback(err);
      });
    });
  });
};

// TODO: Maybe this could just take a task?
Skew.prototype.destroy = function(key, jobId, callback) {
  var self = this;

  self.untrackRedisJob(key, function(err) {
    self.beanstalkPool.acquire(function(err, beanstalk) {
      if (err)
        return callback(new Error(err));

      beanstalk.destroy(jobId, function(err) {
        self.beanstalkPool.release(beanstalk);

        callback(err);
      });
    });
  });
};

exports.client = Skew;
