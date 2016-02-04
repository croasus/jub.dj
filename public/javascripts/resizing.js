// Monolothic resizing for the whole page
function refreshSizes(playerLoaded) {
  this.playerLoaded = this.playerLoaded || playerLoaded;
  var mainRowTop = $('#jub-row-main').position().top;
  var mainRowHeight = $(window).height() - mainRowTop - 10;
  var mainRowWidth = $(window).width();
  var playerPos = $('#player').offset();

  // Chat input width
  $('#chat-input').outerWidth($('#chat-tab-content').width());
  $('#chat-input').css({
    'margin-right': parseInt($('#jub-col-chat').css('padding-right'), 10) +
                    parseInt($('#jub-container').css('padding-right'), 10)
  })

  // DJ banner widths
  var djBannerWidth =
    mainRowWidth
    - $('#chat').outerWidth()
    - parseInt($('#dj-container').css('padding-left'), 10)
    - parseInt($('#dj-container').css('padding-right'), 10)
    - 20;
  $('#dj-container').innerWidth(djBannerWidth);
  $('#current-dj-name').innerWidth(
    $("#queue-panel").innerWidth()
    - $("#time-left").outerWidth()
  );

  // Chat messages and "who's jubbin" list
  var chatTabsBottom = $('#chat-navtabs').offset().top + $('#chat-navtabs').height();
  var msgsHeight = $('#bottom-nav').position().top - chatTabsBottom - 10;

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
