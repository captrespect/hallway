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
        app.profiles = 0;

        var appProfile = _.find(appsProfiles, function(item) {
          return item.id === app.id;
        });

        if (appProfile) {
          app.profiles = appProfile.accounts;
        }

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

        if (app === 'total') {
          return;
        }

        if (!app.details.cat) {
          app.details.cat = '';
        } else {
          app.details.cat = moment(app.details.cat).format("M/D/YYYY h:mma");
        }

        var ratio = Math.round((app.profiles / app.accounts) * 100) / 100;

        $('#rows').append('<tr>' +
            '<td>' + app.id + '</td>' +
            '<td>' + app.details.notes.appName  + '</td>' +
            '<td>' + email + '</td>' +
            '<td>' + app.details.notes.appUrl  + '</td>' +
            '<td>' + app.profiles + '</td>' +
            '<td>' + app.accounts + '</td>' +
            '<td>' + ratio + '</td>' +
            '<td>' + app.details.cat + '</td>' +
          '</tr>');
      });

      sortTable();
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
