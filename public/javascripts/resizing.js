// Monolothic resizing for the whole page
function refreshSizes(playerLoaded) {
  var parseCssInt = function(jqueryResult, cssProp) {
    return parseInt(jqueryResult.css(cssProp), 10);
  }
  this.playerLoaded = this.playerLoaded || playerLoaded;
  var mainRowTop = $('#jub-row-main').position().top;
  var mainRowHeight = $(window).height() - mainRowTop - 10;
  var mainRowWidth = $(window).width();
  var playerPos = $('#player').offset();

  // DJ banner widths
  var djBannerWidth =
    mainRowWidth
    - $('#chat-navtabs').outerWidth()
    - $('#omnibox').outerWidth()
    - parseCssInt($('#dj-container'), 'padding-left')
    - parseCssInt($('#dj-container'), 'padding-right')
    - 20;
  $('#dj-container').innerWidth(djBannerWidth);
  $('#now-playing-label').innerWidth(
    $("#jub-col-queue").innerWidth()
    - parseCssInt($("#jub-col-queue"), 'padding-right')
  );
  $('#current-dj-name').outerWidth(
    $("#player-panel").offset().left
    - $('#now-playing-label').outerWidth()
    - $('#load-video').outerWidth()
    - parseCssInt($('#dj-container'), 'padding-left')
  );

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
