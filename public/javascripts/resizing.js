// Monolothic resizing for the whole page
function refresh_sizes(player_loaded) {
  this.player_loaded = this.player_loaded || player_loaded;
  var main_row_top = $('#jub-row-main').position().top;
  var main_row_height = $(window).height() - main_row_top - 10;
  var main_row_width = $(window).width();
  var player_pos = $('#player').offset();

  // Chat messages and "who's jubbin" list
  var chat_tabs_bottom = $('#chat-navtabs').offset().top + $('#chat-navtabs').height();
  var msgs_height = $('#bottom-nav').position().top - chat_tabs_bottom - 10;

  $('#messages').innerHeight(msgs_height);
  $('#messages').trigger('update_scroll');

  if ($('#jubbin-list-tab').hasClass('active')) {
    $('#jubbin-list').innerHeight(msgs_height);
  }

  // Chat input width
  $('#chat-input').outerWidth($('#chat-tab-content').width());
  $('#chat-input').css({
    'margin-right': parseInt($('#jub-col-chat').css('padding-right'), 10) +
                    parseInt($('#jub-container').css('padding-right'), 10)
  })

  // Set queue and playlists height
  $('#queue-panel').innerHeight(msgs_height - $('#queue-banner').outerHeight());
  $('#video-queue').innerHeight(msgs_height
                                - $('#queue-banner').outerHeight()
                                - $('#playlist-name-banner').outerHeight());
  $('#playlists-panel').innerHeight(msgs_height - $('#playlists-banner').outerHeight());
  $('#playlists').innerHeight(msgs_height - $('#playlists-banner').outerHeight());
}

// Wait until some short period of time has passed after the user stops
// resizing, because while they're doing it we get a flood of events
var resize_timer;
$( window ).resize(function() {
  if (resize_timer) {
    window.clearTimeout(resize_timer)
  }
  resize_timer = window.setTimeout(refresh_sizes, 50);
});

$( document ).ready(function() {
  refresh_sizes();
});
