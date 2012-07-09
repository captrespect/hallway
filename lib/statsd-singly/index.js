var socket = require('dgram').createSocket('udp4');

function Metric(metrics, suffix) {
   if (!(this instanceof Metric)) {
      return new Metric(metrics, suffix);
   }

   this.metrics = metrics;
   this.suffix = suffix;

   return this;
}

Metric.prototype = {
   sample: function(rate) {
      if (Math.random() <= rate) {
         this.rate = '|@' + rate;
      } else {
         this.pass = true;
      }

      return this;
   },
   send: function() {
      if (this.pass) {
         return;
      }

      if (typeof(this.metrics) === 'string') {
         this.metrics = [this.metrics];
      }

      if (Array.isArray(this.metrics)) {
         var array = this.metrics;

         var temp = {};

         array.forEach(function(e, i) {
            temp[e] = '';
         });

         this.metrics = temp;
      }

      var key;

      for (key in this.metrics) {
         if (!this.metrics.hasOwnProperty(key)) {
            continue;
         }

         this.metrics[key] += this.suffix;

         if (this.rate !== undefined) {
            this.metrics[key] += this.rate;
         }

         var buffer = new Buffer(key + ':' + this.metrics[key]);

         socket.send(buffer, 0, buffer.length, this.port, this.host, this.callback);
      }
   }
};

var Client = function(host, port, callback) {
   this.metric.prototype.host = host;
   this.metric.prototype.port = port;

   if (callback === undefined) {
      this.callback = function(err, bytes) {
         if (err) {
            console.error('[stats] ' + err.msg);
         }
      };
   }
};

Client.prototype.metric = Metric;

Client.prototype.gauge = function(metrics) {
   return new this.metric(metrics, '|g');
};

Client.prototype.timing = function(metrics) {
   return new this.metric(metrics, '|ms');
};

Client.prototype.increment = function(metrics) {
   return new this.metric(metrics, '1|c');
};

Client.prototype.decrement = function(metrics) {
   return new this.metric(metrics, '-1|c');
};

Client.prototype.modify = function(metrics) {
   return new this.metric(metrics, '|c');
};

exports.StatsD = Client;
