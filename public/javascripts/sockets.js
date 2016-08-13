var socket = io();

socket.on('force reload', function(obj) {
  console.log('force reload')
  location.reload();
});

// TODO it would be nice if each section of the page could handle its own stuff
// on preferences updates
socket.on('preferences', function(preferences) {
  console.log('received prefs', preferences);
  if (_.has(preferences, 'selectedPlaylist')) {
    prefsSelectedPlaylist = preferences.selectedPlaylist;
    $('#playlists').trigger('redraw');
  }
  if (_.has(preferences, 'requeueVideos')) {
    $('#requeue-videos').prop('checked', !!(preferences.requeueVideos));
  }
  if (_.has(preferences, 'showChatImages')) {
    $('#show-chat-images').prop('checked', !!(preferences.showChatImages));
  }
  if (_.has(preferences, 'allowMuteStatus')) {
    $('#enable-mute-updates').prop('checked', !!(preferences.allowMuteStatus));
  }
});
