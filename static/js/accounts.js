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
  updateSelected();

  $('#rows').html('');

  var options = {};

  var state = $.bbq.getState();

  if (state.appSince) {
    options.appSince = moment().subtract('seconds', parseInt(state.appSince, 10)).unix();
  }

  if (state.accountSince) {
    options.accountSince = moment().subtract('seconds', parseInt(state.accountSince, 10)).unix();
  }

  $.getJSON('/apps/accounts', options, function(appsAccounts) {
    $.getJSON('/apps/profiles', options, function(appsProfiles) {
      appsAccounts.forEach(function(app) {
        (function(currentApp) {
          var appProfile = _.find(appsProfiles, function(item) {
            return item.id === currentApp.id;
          });

          currentApp.profiles = 0;

          if (appProfile) {
            currentApp.profiles = appProfile.accounts;
          }

          $.getJSON('/apps/get?key=' + currentApp.id, function(info) {
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

            var email = '';

            if (info.profile && info.profile.data && info.profile.data.email) {
              email = '<a href="mailto:'+ info.profile.data.email + '">' + info.profile.data.email + '</a>';
            }

            if (currentApp === 'total') {
              return;
            }

            if (!info.cat) {
              info.cat = '';
            } else {
              info.cat = moment(info.cat).format("M/D/YYYY h:mma");
            }

            var ratio = Math.round((currentApp.profiles / currentApp.accounts) * 100) / 100;

            $('#rows').append('<tr>' +
                '<td>' + currentApp.id + '</td>' +
                '<td>' + info.notes.appName  + '</td>' +
                '<td>' + email + '</td>' +
                '<td>' + info.notes.appUrl  + '</td>' +
                '<td>' + currentApp.profiles + '</td>' +
                '<td>' + currentApp.accounts + '</td>' +
                '<td>' + ratio + '</td>' +
                '<td>' + info.cat + '</td>' +
              '</tr>');

            sortTable();
          });
        })(app);
      });
    });
  });
}

function updateSelected() {
  var state = $.bbq.getState();

  $('a.time').removeClass('selected');

  if (state.appSince) {
    $('a[data-parameter=app][data-time=' + humanTimeFromSeconds(state.appSince) + ']').addClass('selected');
  } else {
    $('a[data-parameter=app][data-time=forever]').addClass('selected');
  }

  if (state.accountSince) {
    $('a[data-parameter=account][data-time=' + humanTimeFromSeconds(state.accountSince) + ']').addClass('selected');
  } else {
    $('a[data-parameter=account][data-time=forever]').addClass('selected');
  }
}

$(function() {
  $('a.time').click(function(e) {
    e.preventDefault();

    var $e = $(this);

    var type = $e.attr('data-parameter') + 'Since';

    var humanTime = $e.attr('data-time');

    if (humanTime === 'forever') {
      $.bbq.removeState(type);

      return;
    }

    var seconds = secondsFromHumanTime(humanTime);

    var state = {};

    state[type] = seconds;

    $.bbq.pushState(state);
  });

  refresh();

  $(window).bind('hashchange', function() {
    refresh();
  });

  $('#refresh').click(function() {
    refresh();
  });
});
