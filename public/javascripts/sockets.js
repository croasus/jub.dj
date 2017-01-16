
var socket = io();

// Check for invalid presentation state
socket.on('check auth', function(obj) {
  var userKind = getUserKind();
  var username = getUsername();
  console.log('checking auth');
  if (userKind !== obj.userKind) {
    location.reload();
  }
  if (username !== obj.username) {
    location.reload();
  }
});

socket.on('force reload', function(obj) {
  console.log('force reload')
  location.reload();
});

socket.on('error', function(obj) {
  console.log("Socket connection error:", obj);
  var room = window.location.pathname.slice(1);
  window.location.href = '/welcome' + '?room=' + room;
});

socket.on('disconnect', function() {
  console.log('socket disconnected');
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
  if (_.has(preferences, 'showChatAnimations')) {
    $('#show-chat-animations').prop('checked', !!(preferences.showChatAnimations));
  }
  if (_.has(preferences, 'allowMuteStatus')) {
    $('#enable-mute-updates').prop('checked', !!(preferences.allowMuteStatus));
  }
});
