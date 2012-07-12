function sortTable() {
  $('table').find('td').filter(function() {
    return $(this).index() === 4;
  }).sortElements(function(a, b) {
    return parseInt($.text([a]), 10) > parseInt($.text([b]), 10) ? -1 : 1;
  }, function() {
    return this.parentNode;
  });
}

function refresh() {
  $('#rows').html('');

  var options = {
    since: Date.now() - (31556926 * 1000)
  };

  var qs = $.deparam.querystring();

  if (qs.since) {
    options.since = moment().subtract('minutes', parseInt(qs.since, 10)).valueOf();
  }

  $.getJSON('/apps/hits', options, function(hits) {
    hits.apps.forEach(function(app) {
      if (!app.details || !app.details.notes) {
        app.details = {
          notes: {
            appName: '',
            appUrl: ''
          }
        };
      } else {
        app.details.notes.appUrl = '<a href="' + app.details.notes.appUrl + '">' + app.details.notes.appUrl + '</a>';
      }

      var email = '';

      if (app.details.profile && app.details.profile.data && app.details.profile.data.email) {
        email = '<a href="mailto:'+ app.details.profile.data.email + '">' + app.details.profile.data.email + '</a>';
      }

      if (!app.details.cat) {
        app.details.cat = '';
      } else {
        app.details.cat = moment(app.details.cat).format("M/D/YYYY h:mma");
      }

      $('#rows').append('<tr>' +
          '<td>' + app.id + '</td>' +
          '<td>' + app.details.notes.appName + '</td>' +
          '<td>' + email + '</td>' +
          '<td>' + app.details.notes.appUrl + '</td>' +
          '<td>' + app.hits + '</td>' +
          '<td>' + app.details.cat + '</td>' +
        '</tr>');
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
