var states = {
  0: 'waiting',
  1: 'starting',
  2: 'syncing',
  3: 'pipeline'
};

function sortTable() {
  $('table').each(function(index, element) {
    $(element).find('td').filter(function() {
      return $(this).index() === 4;
    }).sortElements(function(a, b) {
      a = parseInt($(a).attr('data-start'), 10);
      b = parseInt($(b).attr('data-start'), 10);

      return a > b ? 1 : -1;
    }, function() {
      return this.parentNode;
    });
  });
}

function refresh() {
  $.getJSON('/syncSchedule/active', function(active) {
    var profiles = {};

    active.forEach(function(syncSchedule) {
      if (!profiles[syncSchedule.task.profile]) {
        profiles[syncSchedule.task.profile] = {};
      }

      profiles[syncSchedule.task.profile][syncSchedule.task.synclet.connector + '#' + syncSchedule.task.synclet.name] = syncSchedule;
    });

    $.getJSON('/workers/state', function(state) {
      $('#rows').html('');
      $('#disavowed-jobs-rows').html('');

      var i = 0;

      if (state.unresponsive && state.unresponsive.length) {
        $('#unresponsive').text(state.unresponsive.join(', '));

        $('#unresponsive-wrapper').show();
      } else {
        $('#unresponsive').text('');

        $('#unresponsive-wrapper').hide();
      }

      var workerClasses = {};

      _.each(state.workers, function(worker) {
        worker.host = worker.host.replace(/\.singly\.com/, '');
      });

      _.each(profiles, function(jobs, profile) {
        _.each(jobs, function(job, syncletKey) {
          job.worker = job.worker.replace(/\.singly\.com/, '');
        });
      });

      _.sortBy(state.workers, 'host').forEach(function(worker) {
        i++;

        workerClasses[worker.host] = i;

        worker.active.forEach(function(job) {
          var classes = [];

          if (job.tstart < Date.now() - (5 * 60 * 1000)) {
            classes.push('dawgAlert');
          }

          try {
            delete profiles[job.profile][job.synclet.connector + '#' + job.synclet.name];
          } catch(e) {
            // pass, since there's a race condition and we expect this to fail sometimes
          }

          $('#rows').append('<tr>' +
              '<td><span class="worker worker-' + i + '">' + worker.host + '</span></td>' +
              '<td>' + job.synclet.connector + '#' + job.synclet.name + '</td>' +
              '<td>' + job.profile + '</td>' +
              '<td>' + (states[job.state] ? states[job.state] : '') + '</td>' +
              '<td data-start="' + job.tstart + '"><span class="' + classes.join(' ') + '">' + moment(job.tstart).fromNow(true) + '</span></td>' +
              '<td>' + (job.tpipe ? moment(job.tpipe).fromNow(true) : '') + '</td>' +
            '</tr>');
        });
      });

      _.each(profiles, function(jobs, profile) {
        _.each(jobs, function(job, syncletKey) {
          var classes = [];

          // If it's less than a minute ago maybe it's just the race condition
          if (job.task.tstart > Date.now() - (1 * 60 * 1000)) {
            return;
          }

          if (job.task.tstart < Date.now() - (5 * 60 * 1000)) {
            classes.push('dawgAlert');
          }

          var workerClass = '';

          if (workerClasses[job.worker]) {
            workerClass = 'worker-' + workerClasses[job.worker];
          }

          $('#disavowed-jobs-rows').append('<tr>' +
              '<td><span class="worker ' + workerClass + '">' + job.worker + '</span></td>' +
              '<td>' + job.task.synclet.connector + '#' + job.task.synclet.name + '</td>' +
              '<td>' + job.task.profile + '</td>' +
              '<td>' + (states[job.task.state] ? states[job.task.state] : '') + '</td>' +
              '<td data-start="' + job.task.tstart + '"><span class="' + classes.join(' ') + '">' + moment(job.task.tstart).fromNow(true) + '</span></td>' +
              '<td>' + (job.task.tpipe ? moment(job.task.tpipe).fromNow(true) : '') + '</td>' +
            '</tr>');
        });
      });

      if ($('#disavowed-jobs-rows tr').length > 0) {
        $('#disavowed-jobs-wrapper').show();
      } else {
        $('#disavowed-jobs-wrapper').hide();
      }

      sortTable();
    });
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
