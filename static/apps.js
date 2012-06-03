function sortTable() {
  $('table').find('td').filter(function() {
    return $(this).index() === 3;
  }).sortElements(function(a, b) {
    return parseInt($.text([a]), 10) > parseInt($.text([b]), 10) ? -1 : 1;
  }, function() {
    return this.parentNode;
  });
}

function refresh() {
  $('#rows').html('');

  var since = moment().subtract('days', 1).valueOf();

  var qs = $.deparam.querystring();

  if (qs.since) {
    since = moment().subtract('minutes', parseInt(qs.since, 10)).valueOf();
  }

  $.getJSON('/apps/hits?since=' + since, function(apps) {
    for (var app in apps) {
      (function(currentApp) {
        $.getJSON('/apps/get?key=' + app, function(info) {
          info = info[0];

          if (!info || !info.notes) {
            info = {
              notes: {
                appName: '',
                appUrl: ''
              }
            };
          } else {
            info.notes.appUrl = '<a href="' + info.notes.appUrl + '">' + info.notes.appUrl + '</a>';
          }

          if (currentApp === 'total') {
            return;
          }

          if (!info.cat) {
            info.cat = '';
          } else {
            info.cat = moment(info.cat).format("M/D/YYYY h:mma");
          }

          $('#rows').append('<tr>' +
              '<td>' + currentApp + '</td>' +
              '<td>' + info.notes.appName  + '</td>' +
              '<td>' + info.notes.appUrl  + '</td>' +
              '<td>' + apps[currentApp] + '</td>' +
              '<td>' + info.cat + '</td>' +
            '</tr>');

          sortTable();
        });
      })(app);
    }
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});
