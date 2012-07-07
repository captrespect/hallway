function refresh() {
  $('#rows').html('');

  $.getJSON('/workers/state', function(state) {
    var workers = {};

    // XXX: There's a bug in /workers/state we work around here (lots of duplicates)
    _.each(state.workers, function(worker) {
      workers[worker.host] = worker;
    });

    console.log(workers);

    workers = _.sortBy(workers, 'uptime');

    _.each(workers, function(worker) {
      worker.host = worker.host.replace(/\.singly\.com/, '');

      $('#rows').append('<tr>' +
          '<td>' + worker.host + '</td>' +
          '<td><a href="https://github.com/Singly/hallway/commit/">' + worker.version + '</a></td>' +
          '<td>' + moment.duration(worker.uptime, "seconds").humanize() + '</td>' +
          '<td>' + worker.active.length + '</td>' +
          '<td>' + worker.total + '</td>' +
          '<td>' + moment.duration(worker.runtime, "seconds").humanize() + '</td>' +
          '<td>' + worker.publicIp + '</td>' +
          '<td>' + worker.privateIp + '</td>' +
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
