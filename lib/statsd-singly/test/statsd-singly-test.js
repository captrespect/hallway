var should = require('should');
var dgram = require('dgram');

var stats = require('..');

describe('statsd-singly', function() {
   describe('Metric', function() {
      describe('#sample()', function() {
         it('should run with within 15% of the given sample rate', function() {
            var i, j;

            var RUNS = 250;

            var client = new stats.StatsD();

            for (i = 0; i <= 1; i += 0.1) {
               var total = 0;

               for (j = 0; j < RUNS; j++) {
                  var metric = client.gauge({'total': j }).sample(i);

                  if (metric.pass !== true) {
                     metric.rate.should.equal('|@' + i);

                     total++;
                  }
               }

               if (i === 0) {
                  total.should.equal(0);
               } else if (i === 1) {
                  total.should.equal(RUNS);
               } else {
                  total.should.be.within(
                     (i * RUNS) - (RUNS * 0.15),
                     (i * RUNS) +( RUNS * 0.15));
               }
            }
         });
      });
   });

   describe('functions that send data', function() {
      var server;
      var client;

      var matchMessageFn = function(string, done) {
         return function(msg, rinfo) {
            msg.toString().should.equal(string);

            done();
         };
      };

      var matchArrayFn = function(array, done) {
         var results = {};

         array.forEach(function(e, i) {
            results[e] = false;
         });

         return function(msg, rinfo) {
            results[msg.toString()] = true;

            var entries = 0;
            var trueEntries = 0;
            var key;

            for (key in results) {
               if (!results.hasOwnProperty(key)) {
                  continue;
               }

               entries++;

               if (results[key] === true) {
                  trueEntries++;
               }
            }

            if (trueEntries === 3) {
               entries.should.equal(trueEntries);

               done();
            }
         };
      };

      beforeEach(function(done) {
         server = dgram.createSocket('udp4');

         server.on('listening', function() {
            client = new stats.StatsD(server.address().address,
               server.address().port, function(err, bytes) {
                  console.log('err', err, 'bytes', bytes);
               });

            done();
         });

         server.bind();
      });

      describe('#gauge()', function() {
         it('should send data', function(done) {
            server.on('message', matchMessageFn('total:5|g', done));

            client.gauge({ 'total': 5 }).send();
         });

         it('should accept an object with multiple keys', function(done) {
            server.on('message', matchArrayFn([
               'total-1:50|g',
               'total-2:75|g',
               'total-3:100|g',
            ], done));

            client.gauge({
               'total-1': 50,
               'total-2': 75,
               'total-3': 100
            }).send();
         });
      });

      describe('#timing()', function() {
         it('should send data', function(done) {
            server.on('message', matchMessageFn('timing:50|ms', done));

            client.timing({ 'timing': 50 }).send();
         });

         it('should accept an object with multiple keys', function(done) {
            server.on('message', matchArrayFn([
               'timing-1:50|ms',
               'timing-2:75|ms',
               'timing-3:100|ms',
            ], done));

            client.timing({
               'timing-1': 50,
               'timing-2': 75,
               'timing-3': 100
            }).send();
         });
      });

      describe('#increment()', function() {
         it('should send data', function(done) {
            server.on('message', matchMessageFn('users:1|c', done));

            client.increment('users').send();
         });

         it('should accept an array', function(done) {
            server.on('message', matchArrayFn([
               'users-1:1|c',
               'users-2:1|c',
               'users-3:1|c'], done));

            client.increment(['users-1', 'users-2', 'users-3']).send();
         });
      });

      describe('#decrement()', function() {
         it('should send data', function(done) {
            server.on('message', matchMessageFn('users:-1|c', done));

            client.decrement('users').send();
         });

         it('should accept an array', function(done) {
            server.on('message', matchArrayFn([
               'users-1:-1|c',
               'users-2:-1|c',
               'users-3:-1|c'], done));

            client.decrement(['users-1', 'users-2', 'users-3']).send();
         });
      });

      describe('#modify()', function() {
         it('should send data', function(done) {
            server.on('message', matchMessageFn('users:5|c', done));

            client.modify({ 'users': 5 }).send();
         });

         it('should accept an object with multiple keys', function(done) {
            server.on('message', matchArrayFn([
               'users-1:-5|c',
               'users-2:1|c',
               'users-3:10|c'], done));

            client.modify({
               'users-1': -5,
               'users-2': 1,
               'users-3': 10
            }).send();
         });
      });
   });
});
