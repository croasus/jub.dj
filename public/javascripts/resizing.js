// Monolothic resizing for the whole page to account for crappy CSS
function refreshSizes() {
  var parseCssInt = function(jqueryResult, cssProp) {
    return parseInt(jqueryResult.css(cssProp), 10);
  }

  // Chat messages and "who's jubbin" list
  var chatTabsBottom = $('#chat-navtabs').offset().top + $('#chat-navtabs').height();
  var msgsHeight = $('#footer').position().top - chatTabsBottom - 10;

  $('#messages').innerHeight(msgsHeight);
  $('#messages').trigger('update_scroll');

  if ($('#jubbin-list-tab').hasClass('active')) {
    $('#jubbin-list').innerHeight(msgsHeight);
  }

  // Set queue and playlists height
  $('#queue-panel').innerHeight(msgsHeight - $('#queue-banner').outerHeight());
  $('#video-queue').innerHeight(
    msgsHeight
    - $('#queue-banner').outerHeight()
    - $('#playlist-name-banner').outerHeight()
  );
  $('#playlists-panel').innerHeight(msgsHeight - $('#playlists-banner').outerHeight());
  $('#playlists').innerHeight(msgsHeight - $('#playlists-banner').outerHeight());

  // Vendor-specific hacks TODO can this be done with just CSS?
  if (vendor().lowercase === 'moz') {
    document.querySelector('#volume-slider').style.top = '2px';
  }
}

// Wait until some short period of time has passed after the user stops
// resizing, because while they're doing it we get a flood of events
var resizeTimer;
$( window ).resize(function() {
  if (resizeTimer) {
    window.clearTimeout(resizeTimer)
  }
  resizeTimer = window.setTimeout(refreshSizes, 50);
});

$( document ).ready(function() {
  refreshSizes();
});
