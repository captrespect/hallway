function commas(number) {
   return String(number).replace(/(^|[^\w.])(\d{4,})/g, function($0, $1, $2) {
      return $1 + $2.replace(/\d(?=(?:\d\d\d)+(?!\d))/g, "$&,");
   });
}

function secondsFromHumanTime(humanTime) {
   var seconds = humanTime;

   if (/s$/.test(humanTime)) {
      seconds = parseFloat(humanTime, 10);
   } else if (/m$/.test(humanTime)) {
      seconds = parseFloat(humanTime, 10) * 60;
   } else if (/h$/.test(humanTime)) {
      seconds = parseFloat(humanTime, 10) * 60 * 60;
   } else if (/d$/.test(humanTime)) {
      seconds = parseFloat(humanTime, 10) * 60 * 60 * 24;
   } else if (/w$/.test(humanTime)) {
      seconds = parseFloat(humanTime, 10) * 60 * 60 * 24 * 7;
   }

   return seconds;
}

function humanTimeFromSeconds(seconds) {
   var humanTime;

   if (seconds < 60) {
      humanTime = Math.round(seconds) + 's';
   } else if (seconds < 60 * 60) {
      humanTime = (Math.round((seconds / 60) * 10) / 10) + 'm';
   } else if (seconds < 60 * 60 * 24) {
      humanTime = (Math.round((seconds / (60 * 60)) * 100) / 100) + 'h';
   } else if (seconds < 60 * 60 * 24 * 7) {
      humanTime = (Math.round((seconds / (60 * 60 * 24)) * 100) / 100) + 'd';
   } else {
      humanTime = (Math.round((seconds / (60 * 60 * 24 * 7)) * 100) / 100) + 'w';
   }

   return humanTime;
}
