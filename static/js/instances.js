function refresh() {
  async.parallel({
    head: function(callback) {
      $.getJSON('https://api.github.com/repos/Singly/hallway/commits', function(commits) {
        callback(null, commits[0]);
      });
    },
    workers: function(callback) {
      $.getJSON('/workers/state', function(state) {
        callback(null, state.workers);
      });
    },
    apiHosts: function(callback) {
      $.getJSON('/apiHosts/state', function(state) {
        callback(null, state.apiHosts);
      });
    },
  },
  function(err, results) {
    $('#rows').html('');

    $('#head').html('<a href="https://github.com/Singly/hallway/commit/' + results.head.sha + '">' + results.head.sha.slice(0, 8) + '</a>');

    var instances = results.workers.concat(results.apiHosts);

    instances = _.sortBy(instances, 'uptime');

    _.each(instances, function(instance) {
      instance.host = instance.host.replace(/\.singly\.com/, '');

      var url = 'http://' + instance.publicIp + ':8042/state';

      if (/worker/.test(instance.host)) {
        url = 'http://' + instance.publicIp + ':8041/';
      }

      var versionClass = '';

      if (instance.version &&
        instance.version !== results.head.sha) {
        versionClass = 'versionAlert';
      }

      $('#rows').append('<tr>' +
          '<td><a href="' + url + '">' + instance.host + '</a></td>' +
          '<td>' + (instance.version ? '<span class="' + versionClass + '"><a href="https://github.com/Singly/hallway/commit/' + instance.version + '">' + instance.version.slice(0, 8) + '</a></span>' : '') + '</td>' +
          '<td>' + moment.duration(instance.uptime, "seconds").humanize() + '</td>' +
          '<td>' + (instance.active ? instance.active.length : '') + '</td>' +
          '<td>' + (instance.total ? commas(instance.total) : '') + '</td>' +
          '<td>' + (instance.runtime ? (Math.round(instance.runtime * 100) / 100) + 's' : '') + '</td>' +
          '<td>' + Math.round(instance.os.loadavg[0] * 100) / 100 + '</td>' +
          '<td>' + moment.duration(instance.os.uptime, "seconds").humanize() + '</td>' +
          '<td>' + Math.round((instance.os.freemem / 1024 / 1024 / 1024) * 100) / 100 + 'gb</td>' +
          '<td>' + instance.publicIp + '</td>' +
          '<td>' + instance.privateIp + '</td>' +
        '</tr>');
    });
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
