var states = {
  0: 'waiting',
  1: 'starting',
  2: 'syncing',
  3: 'pipeline'
};

$(function() {
  $.getJSON('/workers/state', function(state) {
    for (var worker in state.workers) {
      state.workers[worker].active.forEach(function(job) {
        console.log('job', job);

        $('#rows').append('<tr>' +
            '<td>' + worker  + '</td>' +
            '<td>' + job.synclet.connector + '#' + job.synclet.name  + '</td>' +
            '<td>' + job.profile + '</td>' +
            '<td>' + states[job.state] + '</td>' +
            '<td>' + moment(job.tstart).fromNow() + '</td>' +
            '<td>' + (job.tpipe ? moment(job.tpipe).fromNow() : '') + '</td>' +
          '</tr>');
      });
    }
  });
});
