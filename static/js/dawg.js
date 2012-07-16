function appact(b) {
  $.getJSON('/apps/account', { id: document.forms.appact.id.value }, function(data) {
    if (!data || !data.token) {
      return window.alert("I AM LOST! Heeeeeeellllllllpppppp");
    }

    window.location.replace('https://api.singly.com/profiles?access_token=' + data.token);
  });

  return false;
}

function profileact(b) {
  $.getJSON('/profiles/get', { pid: document.forms.profileact.pid.value }, function(data) {
    if (!data || !data.apps) {
      return window.alert("I AM LOST! Heeeeeeellllllllpppppp");
    }

    window.location.replace('https://api.singly.com/profiles?access_token=' + data.apps[0].token);
  });

  return false;
}
