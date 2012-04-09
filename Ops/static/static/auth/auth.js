;(function($) {

  $.singly = function(options) {
    options.appName = options.appName || 'Sample app';
    options.baseUrl = '/static/auth/';
    options.client_id = options.client_id || '';

    options.redirect_url = options.redirect_url || window.location + '/callback';
    options.services = options.services || ['twitter','facebook'];

    options.host = (window.location.hostname == 'localhost') ? 'http://localhost:8042' : 'http://api.singly.com';

    var auth_twitter = encodeURI(options.host + '/oauth/authorize?client_id=' + options.client_id + '&redirect_uri=' + options.redirect_url + '&service=twitter');
    var auth_facebook = encodeURI(options.host + '/oauth/authorize?client_id=' + options.client_id + '&redirect_uri=' + options.redirect_url + '&service=facebook');
    var popupUI = {};
    var popupPoll = {};

    $('<link rel="stylesheet" type="text/css" href="' + options.host + options.baseUrl + 'auth.css">').appendTo('head');

    $('body').prepend('<div id="SINGLY-auth-container"><div id="SINGLY-pane"><div class="SINGLY-pd10"></div></div></div>');

    if (isLoggedIn()) {
      showLoggedInPane();
    } else {
      showPreviewPane();
    }

    /*
    $("#SINGLY-temp-savepreview").on('click', function(e) {
      // TODO: save preview account and send e-mail
      showSaveAccessPane();
    });

    $("#SINGLY-temp-connectmore").on('click', function(e) {
      // TODO: save preview account and send e-mail
      showConnectMorePane();
    });
    */

    function closeHandler() {
      $(".SINGLY-close-x").on('click', function(e) {
        $("#SINGLY-pane").fadeOut('fast');
      });
    }

    function showLoggedInPane() {
      hidePanes();
      $('body').prepend('<div id="SINGLY-loggedin-pane"><div class="SINGLY-ctr">Username</div><img class="SINGLY-fll SINGLY-powered-by" alt="Powered by Singly" src="' + options.host + options.baseUrl + 'images/poweredbysingly.png"></div>');
    }

    function showPreviewPane() {
      hidePanes(function() {
        $('#SINGLY-pane').addClass('SINGLY-preview-pane');
        $(".SINGLY-pd10").html('<img class="SINGLY-fll" id="SINGLY-preview-pane-symbol" alt="Singly Logo" src="' + options.host + options.baseUrl + 'images/singly-symbol.png"><div class="SINGLY-fll" id="SINGLY-preview-pane-copy">This app is powered by <a class="SINGLY-strong-link" target="_blank" href="https://singly.com">Singly</a>.</div><div><div class="SINGLY-fll SINGLY-action-button" id="SINGLY-preview-app-button">Sign In</div></div><div class="SINGLY-close-x">X</div>');
        $("#SINGLY-or-signin-link").attr('href', '/login?redir=' + window.location.href);
        // wire up the events for the new panel
        $("#SINGLY-preview-app-button").on('click', function(e) {
          showConnectPane();
        });
        closeHandler();
        showPanes();
      });
    }

    function showConnectPane() {
      hidePanes(function() {
        $('#SINGLY-pane').addClass('SINGLY-connect-pane');
        $(".SINGLY-pd10").html('<div id="SINGLY-connect-pane-headline"></div><div id="SINGLY-connect-pane-buttons">  <a href="#" id="SINGLY-connect-facebook" data-provider="facebook" data-width="980" data-height="705"><img alt="Login with Facebook" src="' + options.host + options.baseUrl + 'images/facebook-login.png"></a>  <a href="#" id="SINGLY-connect-twitter" data-provider="twitter" data-width="700" data-height="500"><img alt="Login with Twitter" src="' + options.host + options.baseUrl + 'images/twitter-login.png"></a></div><div class="SINGLY-connect-pane-mglt"><img class="SINGLY-fll SINGLY-powered-by" alt="Powered by Singly" src="' + options.host + options.baseUrl + 'images/poweredbysingly.png"></div><div class="SINGLY-close-x">X</div>');
        $("#SINGLY-connect-pane-headline").html('Connect services to use ' + options.appName);
        $("#SINGLY-connect-facebook").attr('href', auth_facebook);
        $("#SINGLY-connect-twitter").attr('href', auth_twitter);
        // wire up the events for the new panel
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
        closeHandler();
        showPanes();
      });
    }

    /*
    function showSaveAccessPane() {
      hidePanes();
      $('#SINGLY-pane').addClass('SINGLY-saveaccess-pane');
      $(".SINGLY-pd10").html('<div>Save access to this app?  We&0020;ll send you a password and details.</div><div><input type="text"></div><div id="SINGLY-save-preview-button">Save Preview</div><div class="SINGLY-connect-pane-mglt"><img class="SINGLY-fll SINGLY-powered-by" alt="Powered by Singly" src="' + options.host + options.baseUrl + 'images/poweredbysingly.png"></div><div class="SINGLY-close-x">X</div>');
      showPanes();
    }

    function showConnectMorePane() {
      hidePanes();
      $('#SINGLY-pane').addClass('SINGLY-connectmore-pane');
      $(".SINGLY-pd10").html('Connect More pane! (load connectors here from registry or map?)<div class="SINGLY-connect-pane-mglt"><img class="SINGLY-fll SINGLY-powered-by" alt="Powered by Singly" src="' + options.host + options.baseUrl + 'images/poweredbysingly.png"></div><div class="SINGLY-close-x">X</div>');
      showPanes();
    }
    */

    function hidePanes(callback) {
      $("#SINGLY-pane").removeClass().fadeOut('fast', callback);
    }

    function showPanes() {
      $("#SINGLY-pane").fadeIn('fast');
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
            showLoggedInPane();
            hidePanes();
          } else {
            showPreviewPane();
          }
          window.clearInterval(popupPollInterval);
          popupPollInterval = null;
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
  };
})(jQuery);

syncletInstalled = function(synclet) {
  window.location.reload();
};
