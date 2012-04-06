;(function($) {

  $.singly = function(options) {
    options.appName = options.appName || 'Sample app';
    options.baseUrl = '/auth/';
    options.client_id = options.client_id || '';

    options.redirect_url = options.redirect_url || window.location + '/callback';
    options.services = options.services || ['twitter','facebook'];

    options.host = (window.location.hostName == 'localhost') ? 'localhost:8042' : 'api.singly.com';

    var auth_twitter = encodeURI('http://' + options.host + '/oauth/authorize?client_id=1&redirect_uri=' + options.redirect_url + '&service=twitter');
    var auth_facebook = encodeURI('http://' + options.host + '/oauth/authorize?client_id=1&redirect_uri=' + options.redirect_url + '&service=facebook');
    var popupUI = {};
    var popupPoll = {};

    $('<link rel="stylesheet" type="text/css" href="' + options.baseUrl + 'auth.css">').appendTo('head');
    $('<div id="SINGLY-auth-container"></div>').prependTo('body').load(options.baseUrl + 'auth.html', function() {
      if (isLoggedIn()) {
        showLoggedInPane();
      } else {
        showPreviewPane();
      }

      $("#SINGLY-preview-app-button").on('click', function(e) {
        showConnectPane();
      });

      $("#SINGLY-connect-facebook").on('click', function(e) {
        e.preventDefault();
        connectService($(this));
        //showSaveAccessPane();
      });

      $("#SINGLY-connect-twitter").on('click', function(e) {
        e.preventDefault();
        connectService($(this));
        //showSaveAccessPane();
      });

      $("#SINGLY-temp-savepreview").on('click', function(e) {
        // TODO: save preview account and send e-mail
        showSaveAccessPane();
      });

      $("#SINGLY-temp-connectmore").on('click', function(e) {
        // TODO: save preview account and send e-mail
        showConnectMorePane();
      });

      $(".SINGLY-close-x").on('click', function(e) {
        $(".SINGLY-pane").fadeOut('fast');
      });

      function showLoggedInPane() {
        hidePanes();
        $("#SINGLY-loggedin-pane").show();
      }

      function showPreviewPane() {
        hidePanes();
        $("#SINGLY-or-signin-link").attr('href', '/login?redir=' + window.location.href);
        $("#SINGLY-preview-pane").fadeIn('fast');
      }

      function showConnectPane() {
        hidePanes();
        $("#SINGLY-connect-pane-headline").html('Connect services to use ' + options.appName);
        $("#SINGLY-connect-facebook").attr('href', auth_facebook);
        $("#SINGLY-connect-twitter").attr('href', auth_twitter);
        $("#SINGLY-connect-pane").fadeIn('fast');
      }

      function showSaveAccessPane() {
        hidePanes();
        $("#SINGLY-saveaccess-pane").fadeIn('fast');
      }

      function showConnectMorePane() {
        hidePanes();
        $("#SINGLY-connectmore-pane").fadeIn('fast');
      }

      function hidePanes(callback) {
        $(".SINGLY-pane").fadeOut('fast');
      }

      function isLoggedIn() {
        var pairs = document.cookie.split('; ');
        var decode = options.raw ? function(s) { return s; } : decodeURIComponent;
        for (var i=0, pair; pair=pairs[i] && pairs[i].split('='); i++) {
          if (decode(pair[0]) === 'account-' + options.client_id && pair[1] !== '') {
            return true;
          }
        }
        return false;
      }

      function pollPopup() {
        try {
          if (popupUI.closed) {
            if (isLoggedIn()) {
              window.clearInterval(popupPollInterval);
              popupPollInterval = null;
              showLoggedInPane();
              hidePanes();
            } else {
              showPreviewPane();
            }
          }
        } catch (x) {
          // doh probably got stopped by browser security
        }
      }

      function connectService(element) {
        var options =
          'width='   + element.data('width')  +
          ',height=' + element.data('height') +
          ',status=no,scrollbars=no,resizable=no';
        popupUI = window.open(element.attr('href'),'account', options);
        popupUI.focus();
        popupPollInterval = window.setInterval(pollPopup, 100);
      }
    });
  };
})(jQuery);

syncletInstalled = function(synclet) {
  window.location.reload();
};
