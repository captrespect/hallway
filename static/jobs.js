var states = {
  0: 'waiting',
  1: 'starting',
  2: 'syncing',
  3: 'pipeline'
};

function refresh() {
  $('#rows').html('');

  $.getJSON('/workers/state', function(state) {
    for (var worker in state.workers) {
      state.workers[worker].active.forEach(function(job) {
        $('#rows').append('<tr>' +
            '<td>' + worker  + '</td>' +
            '<td>' + job.synclet.connector + '#' + job.synclet.name  + '</td>' +
            '<td>' + job.profile + '</td>' +
            '<td>' + states[job.state] + '</td>' +
            '<td>' + moment(job.tstart).fromNow(true) + '</td>' +
            '<td>' + (job.tpipe ? moment(job.tpipe).fromNow(true) : '') + '</td>' +
          '</tr>');
      });
    }
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
