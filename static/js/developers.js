function refresh() {

  $('#rows').html('');

  var options = {};

  $.getJSON('/devs', options, function(developers) {
    var total = 0;
    developers.forEach(function(day) {
      if (!day.day) {
        day.day = '';
      } else {
        day.day = moment(day.day).format("M/D/YYYY");
      }

      total += parseInt(day.accountCount,10);

      $('#rows').append('<tr>' +
                        '<td>' + day.day + '</td>' +
                        '<td>' + day.accountCount  + '</td>' +
                        '</tr>');
    });

    $('#rows').append('<tr>' +
                      '<td>' + "TOTAL" + '</td>' +
                      '<td>' + total  + '</td>' +
                      '</tr>');
  });
}

$(function() {
  refresh();
});
