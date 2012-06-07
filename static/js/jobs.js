var states = {
  0: 'waiting',
  1: 'starting',
  2: 'syncing',
  3: 'pipeline'
};

function sortTable() {
  $('table').find('td').filter(function() {
    return $(this).index() === 4;
  }).sortElements(function(a, b) {
    a = parseInt($(a).attr('data-start'), 10);
    b = parseInt($(b).attr('data-start'), 10);

    return a > b ? 1 : -1;
  }, function() {
    return this.parentNode;
  });
}

function refresh() {
  $('#rows').html('');

  $.getJSON('/workers/state', function(state) {
    var i = 0;

    if (state.unresponsive && state.unresponsive.length) {
      $('#unresponsive').text(state.unresponsive.join(', '));

      $('#unresponsive-wrapper').show();
    } else {
      $('#unresponsive').text('');

      $('#unresponsive-wrapper').hide();
    }

    _.sortBy(state.workers, 'publicIp').forEach(function(worker) {
      i++;

      worker.active.forEach(function(job) {
        var classes = [];

        if (job.tstart < Date.now() - (5 * 60 * 1000)) {
          classes.push('dawgAlert');
        }

        $('#rows').append('<tr>' +
            '<td><span class="worker worker-' + i + '">' + worker.publicIp + '</span></td>' +
            '<td>' + job.synclet.connector + '#' + job.synclet.name + '</td>' +
            '<td>' + job.profile + '</td>' +
            '<td>' + states[job.state] + '</td>' +
            '<td data-start="' + job.tstart + '"><span class="' + classes.join(' ') + '">' + moment(job.tstart).fromNow(true) + '</span></td>' +
            '<td>' + (job.tpipe ? moment(job.tpipe).fromNow(true) : '') + '</td>' +
          '</tr>');
      });
    });

    sortTable();
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
