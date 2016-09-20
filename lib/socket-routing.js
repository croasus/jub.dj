var jubUtil = require('./jub_util');
var util = require('util');
var cookie = require('cookie');
var _ = require('lodash');
var Set = require("collections/set");
jubUtil.monkeyPatch();
require('./logging')();

// Future of socket routing...
// Options:
//   1) big data map, here, mapping channel names to functions in different modules
//   2) everything remains in code form
//
//
// For historical reasons, the jub does not have a reference to this socketeer,
// but we will give it a couple of functions
function Socketeer(jub, chat, bot, config, auth, io) {

  var UPDATE_USERS_INTERVAL = 10 * 1000;
  var updateUsersInterval = null;

  function stop() {
    console.log("socket-routing stopping");
    if (updateUsersInterval) { clearInterval(updateUsersInterval); }
  }
  jub.stopFns.push(stop);

  // Clear socket map and ping users
  function refreshUsers() {
    // TODO remove jubUtil.clearObj(userToSockets);
    pingUsers();
  }

  function broadcast(channel, message) {
    io.emit(channel, message);
  }

  function tokenForSocket(socket) {
    var cookies = cookie.parse(socket.handshake.headers.cookie);
    var token = cookies.sessionToken;
    return token;
  }

  function sessionForSocket(socket) {
    var token = tokenForSocket(socket);
    return auth.parseToken(token);
  }

  // Calls callback iff the socket's token is a valid token with type
  // 'account'
  function ifValidAccountToken(socket, callback) {
    var token = tokenForSocket(socket);
    auth.validateSessionToken(token, jub.secret, function(valid) {
      if (valid) {
        var session = auth.parseToken(token);
        if (session.userKind === 'account') {
          callback();
        }
      }
    });
  }

  function getAllConnectedUsers() {
    var sockets = io.sockets.connected;
    return _.map(sockets, function(s) { return sessionForSocket(s).username; });
  }

  // Periodically examine currently-connected sockets to determine the current
  // users
  function jubUpdateUsers() {
    var users = getAllConnectedUsers();
    jub.setCurrentUsers(users, emitUsersInfo);
  }
  var updateUsersInterval = setInterval(jubUpdateUsers, UPDATE_USERS_INTERVAL);

  function getUserSockets(user) {
    var sockets = io.sockets.connected;
    console.log('getUserSockets for user', user);
    return _.filter(sockets, function(s) { return sessionForSocket(s).username === user; });
  }

  function whisper(user, channel, message) {
    var sockets = getUserSockets(user);

    sockets.forEach(function(socket) {
      socket.emit(channel, message);
    });
  }

  function getUserIP(user) {
    var sock = getUserSockets(user)[0];
    if (!sock) { return null; }
    var ip = sock.client.conn.remoteAddress.split(':').pop();
    return ip;
  }

  // Give hooks to jub and chat
  for (x of [jub, chat, bot]) {
    x.broadcast = broadcast;
    x.whisper = whisper;
    x.getUserIP = getUserIP;
  }

  function emitUsersInfo(userList) {
    io.emit('users info', userList);
  }

  function emitChat(msg) {
    io.emit('chat message', msg);
  }

  // Pass in `io` for broadcast; `socket` for direct message
  function emitVideoState(sockets) {
    sockets.emit('video state', jub.emittableVideoState());
  }

  function emitQueueFor(user, socket) {
    socket.emit('queue', jub.emittableQueueFor(user));
  }

  function emitPlaylistsFor(user) {
    jub.fetchPlaylistsFor(user, function(lists) {
      console.log('socket-routing emitPlaylistsFor', user, lists);
      whisper(user, 'playlists', lists);
    });
  }

  function emitPreferencesFor(user) {
    jub.fetchPreferencesFor(user, function(prefs) {
      console.log('emitting prefs', user, prefs);
      whisper(user, 'preferences', prefs);
    });
  }

  // Initiates a roll call; client sockets respond indicating presence
  function pingUsers() {
    io.emit('ping users', 0);
  }

  // Validate session token
  io.set('authorization', function(handshakeData, accept) {
    var cookies = cookie.parse(handshakeData.headers.cookie);
    console.log('socket auth cookies:', cookies);
    var token = cookies.sessionToken;
    if (token && token !== '') {
      jub.validateSessionToken(token, function(valid) {
        if (valid) {
          console.log('accepting socket connection');
          accept(null, true);
        } else {
          console.log('invalid/expired token');
          accept('Invalid/Expired session token', false);
        }
      });
    } else {
      console.log('no token');
      accept('No session token', false);
    }
  });

  io.on('connection', function(socket) {
    var session = sessionForSocket(socket);
    var user = session.user;

    console.log('socket connected with token', session);

    // User connected ('connection' above)
    pingUsers();

    // User disconnected
    socket.on('disconnect', function() {
      console.log('socket disconnected: %s', socket.conn.remoteAddress);
      refreshUsers();
    });

    // Log errors
    socket.on('error', function(error) {
      console.error(error);
    });

    // A user just loaded the page; send them a welcome message. Callback is
    // for sending the user's data back to it.
    socket.on('user loaded', function() {
      console.log('user loaded');
      // Validate, modify (if necessary), store and return the user's info
      //jub.userLoaded(user); // TODO maybe remove if this doesn't end up doing anything

      // Send the user a welcome message in chat
      chat.welcome(sessionForSocket(socket).username, function(msg) {
        console.log('emitting', msg);
        socket.emit('chat message', msg);
      });

      jubUpdateUsers();
    });

    socket.on('chat cache', function() {
      jub.getChatCache(function(msg) {
        // Use socket directly so that the messages aren't sent to all of the
        // user's open browsers
        socket.emit('chat message', msg);
      });
    });

    socket.on('up next', function() {
      jub.getUpNext(function(list) {
        socket.emit('up next', list);
      });
    });

    socket.on('mute update', function(isMuted) {
      var user = sessionForSocket(socket).username;
      jub.updateMute(user, isMuted, function(userList) {
        emitUsersInfo(userList);
      });
    });

    // A user reported presence TODO remove
    socket.on('user present', function() {
      if (user) {
        jub.addUser(user, socket, function(userList) {
          emitUsersInfo(userList);
        });
      }
    });

    // Chat message received from a client
    // TODO add user to message obj, based on socket session
    socket.on('chat message', function(clientMsgObj) {
      console.log('new chat message');
      chat.newChatMessage(clientMsgObj);
    });

    // Enqueue new video
    socket.on('video enqueue', function(playlist, video) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.enqueueVideo(user, playlist, video);
      });
    });

    // User asks if it is DJing
    socket.on('user djing', function() {
      var user = sessionForSocket(socket).username;
      jub.userDjing(user, function(state) {
        whisper(user, 'user djing', state);
      });
    });

    // Add DJ
    socket.on('add dj', function() {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.addDj(user);
      });
    });

    // Remove DJ
    socket.on('remove dj', function() {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.removeDj(user);
      });
    });

    // Skip video
    socket.on('video skip', function() {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.videoSkipped(user);
      });
    });

    // Like
    socket.on('like', function() {
      var user = sessionForSocket(socket).username;
      jub.userOpinion(user, true);
    });

    // Dislike
    socket.on('dislike', function() {
      var user = sessionForSocket(socket).username;
      jub.userOpinion(user, false);
    });

    // Shuffle
    socket.on('shuffle', function(playlist, callback) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.shuffle(user, playlist, callback);
      });
    });

    // Delete tracks
    socket.on('delete tracks', function(playlist, indices, callback) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.deleteTracks(user, playlist, indices, callback);
      });
    });

    // Send tracks to top of queue
    socket.on('send to top', function(playlist, indices, callback) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.sendToTop(user, playlist, indices, callback);
      });
    });

    // Send tracks to bottom of queue
    socket.on('send to bottom', function(playlist, indices, callback) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.sendToBottom(user, playlist, indices, callback);
      });
    });

    // Clip song in user's playlist
    socket.on('clip track', function(playlist, selectedIndex, startTime, endTime) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.clipTrack(user, playlist, selectedIndex, startTime, endTime)
      });
    });

    // Dequeue video for user
    socket.on('video dequeue', function(playlist) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.dequeueVideo(user, playlist);
      });
    });

    // Enqueue an array of videos. TODO get rid of 'video enqueue'
    socket.on('videos enqueue', function(playlist, videos) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.enqueueVideos(user, playlist, videos);
      });
    });

    // Client requested video state
    socket.on('video state', function() {
      // Send current state to that client
      emitVideoState(socket);
    });

    // Client requested queue state
    socket.on('queue', function() {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        console.log('client requested queue state', user);
        // Send current state to that client
        emitQueueFor(user, socket);
      });
    });

    // Client requested playlists
    // TODO be clear about usage of socket-passing vs whisper
    socket.on('playlists', function() {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        console.log('client requested playlists');
        emitPlaylistsFor(user);
      });
    });

    socket.on('preferences', function() {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        console.log('client requested prefs');
        emitPreferencesFor(user);
      });
    });

    // Rename a playlist. Knows to create a new 'sandbox' if fromName is 'sandbox'
    socket.on('rename playlist', function(fromName, toName) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        console.log('user', user, 'wishes to rename from', fromName, 'to', toName);
        jub.renamePlaylist(user, fromName, toName);
      });
    });

    // Copy playlist
    socket.on('copy playlist', function(playlistName) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.copyPlaylist(user, playlistName);
      });
    });

    // Delete playlist
    socket.on('delete playlist', function(playlistName) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.deletePlaylist(user, playlistName, function() {
          emitPlaylistsFor(user);
        });
      });
    });

    socket.on('update user preferences', function(prefs) {
      ifValidAccountToken(socket, function() {
        var user = sessionForSocket(socket).username;
        jub.updateUserPreferences(user, prefs);
      });
    });

    // Client requested youtube search results -- perform the video search
    // and call the client's provided callback
    // TODO remove once clients are doing this
    socket.on('video search', function(query, callback) {
      ifValidAccountToken(socket, function() {
        console.log('searching for', query);
        jub.videoSearch(query, function(results) {
          callback(results);
        });
      });
    });

    socket.on('gapi key', function(callback) {
      ifValidAccountToken(socket, function() {
        console.log('$TEST:', process.env.TEST);
        if(process.env.TEST) {
          callback(config.google_api_server_key);
        } else {
          callback(config.google_api_browser_key);
        }
      });
    });
  });
}

module.exports = function(jub, chat, bot, config, auth, io) {
  return new Socketeer(jub, chat, bot, config, auth, io);
}
