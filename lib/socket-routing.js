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

  function stop() {
    console.log("socket-routing stopping");
    clearInterval(trimInterval);
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

  function sessionForSocket(socket) {
    var cookies = cookie.parse(socket.handshake.headers.cookie);
    var token = cookies.sessionToken;
    return auth.parseToken(token);
  }

  function getAllConnectedUsers() {
    var sockets = io.sockets.connected;
    return _.map(sockets, function(s) { return sessionForSocket(s).username; });
  }

  function jubUpdateUsers() {
    jub.setCurrentUsers(getAllConnectedUsers());
  }

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

  function emitUsers(userList) {
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
      whisper(user, 'playlists', lists);
    });
  }

  function emitPreferencesFor(user) {
    jub.fetchPreferencesFor(user, function(prefs) {
      console.log('emitting', user, prefs);
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
    console.log('sockets: ', io.sockets.connected);
    var session = sessionForSocket(socket);
    var user = session.user;

    console.log('socket connected with token', session);

    // User connected ('connection' above)
    console.log('client connected: %s', socket.request.headers);
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
    socket.on('user loaded', function(clientCb) {
      // Validate, modify (if necessary), store and return the user's info
      jub.userLoaded(user, function(info) {

        // Send the user its info (only `name` is used)
        clientCb(info);

        // Keep track of this socket by its user
        addUserSocket(info.name, socket);

        // Send the user a welcome message in chat
        chat.welcome(info.name, function(msg) {
          // Use socket directly so that the message isn't sent to all of the
          // user's open browsers
          socket.emit('chat message', msg);
        });

        jubUpdateUsers();
      });
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
        jub.updateMute(user, isMuted, function(userList) {
          emitUsers(userList);
        });
    });

    // A user reported presence
    // TODO don't need addUserSocket anymore
    socket.on('user present', function() {
      if (user) {
        addUserSocket(user, socket);
        jub.addUser(user, socket, function(userList) {
          emitUsers(userList);
        });
      }
    });

    // Chat message received from a client
    // TODO add user to message obj, based on socket session
    socket.on('chat message', function(clientMsgObj) {
      chat.newChatMessage(clientMsgObj);
    });

    // Enqueue new video
    socket.on('video enqueue', function(playlist, video) {
      jub.enqueueVideo(user, playlist, video);
    });

    // User asks if it is DJing
    socket.on('user djing', function() {
      jub.userDjing(user, function(state) {
        whisper(user, 'user djing', state);
      });
    });

    // Add DJ
    socket.on('add dj', function() {
      jub.addDj(user);
    });

    // Remove DJ
    socket.on('remove dj', function() {
      jub.removeDj(user);
    });

    // Skip video
    socket.on('video skip', function() {
      jub.videoSkipped(user);
    });

    // Like
    socket.on('like', function() {
      jub.userOpinion(user, true);
    });

    // Dislike
    socket.on('dislike', function() {
      jub.userOpinion(user, false);
    });

    // Shuffle
    socket.on('shuffle', function(playlist, callback) {
      jub.shuffle(user, playlist, callback);
    });

    // Delete tracks
    socket.on('delete tracks', function(playlist, indices, callback) {
      jub.deleteTracks(user, playlist, indices, callback);
    });

    // Send tracks to top of queue
    socket.on('send to top', function(playlist, indices, callback) {
      jub.sendToTop(user, playlist, indices, callback);
    });

    // Send tracks to bottom of queue
    socket.on('send to bottom', function(playlist, indices, callback) {
      jub.sendToBottom(user, playlist, indices, callback);
    });

    // Clip song in user's playlist
    socket.on('clip track', function(playlist, selectedIndex, startTime, endTime) {
      jub.clipTrack(user, playlist, selectedIndex, startTime, endTime)
    });

    // Dequeue video for user
    socket.on('video dequeue', function(playlist) {
      jub.dequeueVideo(user, playlist);
    });

    // Enqueue an array of videos. TODO get rid of 'video enqueue'
    socket.on('videos enqueue', function(playlist, videos) {
      jub.enqueueVideos(user, playlist, videos);
    });

    // Client requested video state
    socket.on('video state', function() {
      // Send current state to that client
      emitVideoState(socket);
    });

    // Client requested queue state
    socket.on('queue', function() {
      console.log('client requested queue state', user);
      // Send current state to that client
      emitQueueFor(user, socket);
    });

    // Client requested playlists
    // TODO be clear about usage of socket-passing vs whisper
    socket.on('playlists', function() {
      console.log('client requested playlists', user);
      emitPlaylistsFor(user);
    });

    socket.on('preferences', function() {
      console.log('client requested preferences', user);
      emitPreferencesFor(user);
    });

    // Rename a playlist. Knows to create a new 'sandbox' if fromName is 'sandbox'
    socket.on('rename playlist', function(fromName, toName) {
      console.log('user', user, 'wishes to rename from', fromName, 'to', toName);
      jub.renamePlaylist(user, fromName, toName);
    });

    // Copy playlist
    socket.on('copy playlist', function(playlistName) {
      jub.copyPlaylist(user, playlistName);
    });

    // Delete playlist
    socket.on('delete playlist', function(playlistName) {
      jub.deletePlaylist(user, playlistName, function() {
        emitPlaylistsFor(user);
      });
    });

    socket.on('update user preferences', function(prefs) {
      jub.updateUserPreferences(user, prefs);
    });

    // Client requested youtube search results -- perform the video search
    // and call the client's provided callback
    // TODO remove once clients are doing this
    socket.on('video search', function(query, callback) {
      console.log('searching for', query);
      jub.videoSearch(query, function(results) {
        callback(results);
      });
    });

    socket.on('gapi key', function(callback) {
      console.log('$TEST:', process.env.TEST);
      if(process.env.TEST) {
        callback(config.google_api_server_key);
      } else {
        callback(config.google_api_browser_key);
      }
    });
  });
}

module.exports = function(jub, chat, bot, config, auth, io) {
  return new Socketeer(jub, chat, bot, config, auth, io);
}
