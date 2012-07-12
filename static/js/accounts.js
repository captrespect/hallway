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

          if (!currentApp.details || !currentApp.details.notes) {
            currentApp.details = {
              notes: {
                appName: '',
                appUrl: ''
              }
            };
          } else {
            currentApp.details.notes.appUrl = '<a href="' + currentApp.details.notes.appUrl + '">' + currentApp.details.notes.appUrl + '</a>';
          }

          var email = '';

          if (currentApp.details.profile && currentApp.details.profile.data && currentApp.details.profile.data.email) {
            email = '<a href="mailto:'+ currentApp.details.profile.data.email + '">' + currentApp.details.profile.data.email + '</a>';
          }

          if (currentApp === 'total') {
            return;
          }

          if (!currentApp.details.cat) {
            currentApp.details.cat = '';
          } else {
            currentApp.details.cat = moment(currentApp.details.cat).format("M/D/YYYY h:mma");
          }

          var ratio = Math.round((currentApp.profiles / currentApp.accounts) * 100) / 100;

          $('#rows').append('<tr>' +
              '<td>' + currentApp.id + '</td>' +
              '<td>' + currentApp.details.notes.appName  + '</td>' +
              '<td>' + email + '</td>' +
              '<td>' + currentApp.details.notes.appUrl  + '</td>' +
              '<td>' + currentApp.profiles + '</td>' +
              '<td>' + currentApp.accounts + '</td>' +
              '<td>' + ratio + '</td>' +
              '<td>' + currentApp.details.cat + '</td>' +
            '</tr>');
        })(app);

        sortTable();
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
