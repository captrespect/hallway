## statsd-singly

A node.js library for communicating with statsd over UDP. Provides mocha unit tests.

### Examples

```js
var statsd = require('statsd-singly').StatsD('localhost', 8125);

// Gauges
statsd.gauge({ users: 35 }).send();

// Multiple gauges
statsd.gauge({ users: 35, guests: 48 }).send();

// Any measurement can also specify a sample rate
statsd.gauge({ users: 35 }).sample(0.5).send();

// Timings (in milliseconds)
statsd.timing({ page-load: 74 }).send();

// Incrementing multiple counters
statsd.increment(['logins', 'errors']).send();

// Decrementing a counter
statsd.decrement('logins').send();

// Modifying a counter by more than +1 or -1
statsd.modify({ errors: 5 }).send();

// Modifying multiple counters
statsd.modify({ errors: 5, syntaxErrors: 2 }).send();
```
