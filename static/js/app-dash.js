var context = cubism.context()
  .step(60 * 1000)
  .size(960);

var graphite = context.graphite('http://graphic.singly.com');

var metrics = {};

// The list of metric searches for each dashboard
var dashboards = {
  overview: [
    'stats.api.hits',
    'stats.dal.*',
    'stats.gauges.apps.active.*',
    'stats.gauges.slack.*',
    'stats.gauges.slag.*',
    'stats.gauges.workers.*',
    'stats.synclet.run',
    'stats.ijod.*',
    'stats.timers.dal.query_length.upper',
    'stats.timers.ijod.save_time.upper',
    'stats.timers.pipeline.run.upper',
    'stats.timers.s3.getOne.upper',
    'stats.timers.s3.getRange.upper'
  ],
  errors: [
    'stats.synclet.error.*.*'
  ],
  features: [
    'stats.app.features.*'
  ],
  requestDurations: [
    'stats.timers.request.duration.*.upper'
  ],
  services: [
    'stats.app.services.rollup',
    'stats.app.services.*.*'
  ],
  servicesItems: [
    'stats.synclet.items.services.rollup',
    'stats.synclet.items.services.*.*'
  ],
  types: [
    'stats.app.types.*',
    'stats.app.types.discovery.*'
  ],
  typesItems: [
    // Call these out individually since there's a lot of noise
    'stats.data.types.photo',
    'stats.data.types.news',
    'stats.data.types.video',
    'stats.data.types.status',
    'stats.data.types.contact',
    'stats.data.types.checkin'
  ],
  proxy: [
    'stats.app.proxy.*'
  ]
};

function addMetrics(dashboard, results, callback) {
  if (!metrics[dashboard]) {
    metrics[dashboard] = [];
  }

  results.forEach(function(result) {
    // If there's another level don't add the stat
    if (/\.$/.test(result)) {
      return;
    }

    // upper returns upper and upper_90, we just want upper
    if (/upper_90$/.test(result)) {
      return;
    }

    metrics[dashboard].push(graphite.metric(result));
  });

  callback();
}

function setupOverview() {
  d3.select('#overview').call(function(div) {
    var active5m1 = graphite.metric('stats.gauges.apps.active.5m');
    var active5m2 = active5m1.shift(-7 * 24 * 60 * 60 * 1000);

    // Compare active apps vs. 7 days ago
    div.selectAll('.comparison')
        .data([[active5m1, active5m2]])
      .enter().append('div')
        .attr('class', 'comparison')
        .call(context.comparison().title('apps.active.5m vs. 7 days ago'));

    // Create a rule that follows the mouse
    div.append('div')
      .attr('class', 'rule')
      .call(context.rule());
  });
}

$(function() {
  // Search for metrics in parallel
  _.each(dashboards, function(searches, dashboard) {
    async.forEach(searches, function(search, searchCallback) {
      if (/\*/.test(search)) {
        graphite.find(search, function(err, results) {
          addMetrics(dashboard, results, searchCallback);
        });
      } else {
        addMetrics(dashboard, [search], searchCallback);
      }
    },
    // When all of the searches finish...
    function(err) {
      // Sort by the name of the metric
      metrics[dashboard] = _.sortBy(metrics[dashboard], function(metric) {
        return metric.toString();
      });

      // Select the dashboard's div
      d3.select('#' + dashboard).call(function(div) {
        // Create a time axis at the top
        div.append('div')
          .attr('class', 'axis')
          .call(context.axis().orient('top'));

        // Create the horizon charts
        div.selectAll('.horizon')
            .data(metrics[dashboard])
          .enter().append('div')
            .attr('class', 'horizon')
            .call(context.horizon().title(function(d) {
              // Remove stats., stats.gauges. from the titles
              return d.toString().replace(/^stats\.(gauges\.)?/, '');
            }));
      });

      // The overview dashboard has some additional elements added
      if (dashboard === 'overview') {
        setupOverview();
      }
    });
  });

  // Move the data value to follow the rule
  context.on('focus', function(i) {
    d3.selectAll('.value').style('right', i === null ? null : context.size() - i + 'px');
  });
});
