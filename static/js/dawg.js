function appact(b) {
  $.getJSON('/apps/account', { id: document.forms.appact.id.value }, function(data) {
    if (!data || !data.token) {
      return window.alert("I AM LOST! Heeeeeeellllllllpppppp");
    }

    window.location.replace('https://api.singly.com/profiles?access_token=' + data.token);
  });

  return false;
}
