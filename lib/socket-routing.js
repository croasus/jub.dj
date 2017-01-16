let jubUtil = require('./jub_util');
let util = require('util');
let cookie = require('cookie');
let _ = require('lodash');
let Set = require("collections/set");
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

  let UPDATE_USERS_INTERVAL = 10 * 1000;
  let updateUsersInterval = null;

  function stop() {
    console.log("socket-routing stopping");
    if (updateUsersInterval) { clearInterval(updateUsersInterval); }
  }
  jub.stopFns.push(stop);

  // TODO I want this to force a reconnect, not just disconnect.
  function reconnectEveryoneElse(but) {
    let butToken = cookie.parse(but.handshake.headers.cookie).sessionToken;
    console.log("reconnecting all but ", butToken);
    let sockets = io.sockets.connected;
    _.each(sockets, s => {
      if (!s) { return; }
      let token = cookie.parse(s.handshake.headers.cookie).sessionToken;
      if (token && (token !== butToken)) {
        console.log("disconnecting", token);
        s.client.conn.close();
      }
    });
  }

  // XXX This helps clients make sure their state is up-to-date with their
  // session tokens. It's used to keep browser tabs in sync.
  // Optionally supply `but`, which is a socket you want to ignore here
  function requestAllCheckAuth(but) {
    let butToken = null;
    if (but && !(but.handshake)) {
      butToken = cookie.parse(but.handshake.headers.cookie).sessionToken;
    }
    console.log("requesting clients check their auth");
    let sockets = io.sockets.connected;
    _.each(sockets, s => {
      if (!s) {
        console.log("WARNING: encountered null socket while iterating");
        return;
      }
      let token = cookie.parse(s.handshake.headers.cookie).sessionToken;
      if (token && (!butToken || (token !== butToken))) {
        requestCheckAuth(s, token);
      }
    });
  }

  // Pass in a socket
  function requestCheckAuth(s, token) {
    if (!s) {
      console.log("WARNING requestedCheckAuth for", s);
    }
    if (token === undefined) {
      token = cookie.parse(s.handshake.headers.cookie).sessionToken;
    }
    let session = auth.parseToken(token);
    console.log("requesting client checks auth", session.username);
    let state = {
      userKind: session.userKind,
      username: session.username
    };
    s.emit('check auth', state);
  }

  function broadcast(channel, message) {
    io.emit(channel, message);
  }

  function tokenForSocket(socket) {
    let cookies = cookie.parse(socket.handshake.headers.cookie);
    let token = cookies.sessionToken;
    return token;
  }

  function sessionForSocket(socket) {
    let token = tokenForSocket(socket);
    return auth.parseToken(token);
  }

  // Calls callback iff the socket's token is a valid token with type
  // 'account'
  function ifValidAccountToken(socket, callback) {
    let token = tokenForSocket(socket);
    auth.validateSessionToken(token, jub.secret, valid => {
      if (valid) {
        let session = auth.parseToken(token);
        if (session.userKind === 'account') {
          callback();
        }
      }
    });
  }

  function getAllConnectedUsers() {
    let sockets = io.sockets.connected;
    return _.map(sockets, s => { return sessionForSocket(s).username; });
  }

  // Periodically examine currently-connected sockets to determine the current
  // users
  function jubUpdateUsers() {
    let users = getAllConnectedUsers();
    jub.setCurrentUsers(users, emitUsersInfo);
  }
  updateUsersInterval = setInterval(jubUpdateUsers, UPDATE_USERS_INTERVAL);

  function getUserSockets(user) {
    let sockets = io.sockets.connected;
    console.log('getUserSockets for user', user);
    return _.filter(sockets, s => { return sessionForSocket(s).username === user; });
  }

  function whisper(user, channel, message) {
    let sockets = getUserSockets(user);

    sockets.forEach(socket => {
      socket.emit(channel, message);
    });
  }

  function getUserIP(user) {
    let sock = getUserSockets(user)[0];
    if (!sock) { return null; }
    let ip = sock.client.conn.remoteAddress.split(':').pop();
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
    jub.fetchPlaylistsFor(user, lists => {
      whisper(user, 'playlists', lists);
    });
  }

  function emitPreferencesFor(user) {
    jub.fetchPreferencesFor(user, prefs => {
      console.log('emitting prefs', user, prefs);
      whisper(user, 'preferences', prefs);
    });
  }

  // Validate session token
  io.set('authorization', (handshakeData, accept) => {
    let cookies = cookie.parse(handshakeData.headers.cookie);
    console.log('socket auth cookies:', cookies);
    let token = cookies.sessionToken;
    if (token && token !== '') {
      jub.validateSessionToken(token, valid => {
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

  io.on('connection', socket => {
    let session = sessionForSocket(socket);
    let user = session.user;

    console.log('socket connected with token', session);

    // Ask other clients to check their auth states. Don't ask this socket yet
    // because it may not be ready. It will be asked to check when it sends
    // 'user loaded'
    requestAllCheckAuth(socket);

    // User disconnected
    socket.on('disconnect', () => {
      console.log('socket disconnected: %s', socket.conn.remoteAddress);
      requestAllCheckAuth();
      jubUpdateUsers();
    });

    // Log errors
    socket.on('error', error => {
      console.error(error);
    });

    // A user just loaded the page; send them a welcome message. Callback is
    // for sending the user's data back to it.
    socket.on('user loaded', () => {
      console.log('user loaded');

      requestCheckAuth(socket);

      // Send the user a welcome message in chat
      chat.welcome(sessionForSocket(socket).username, msg => {
        console.log('emitting', msg);
        socket.emit('chat message', msg);
      });

      jubUpdateUsers();
    });

    socket.on('chat cache', () => {
      jub.getChatCache(msg => {
        msg.history = true;
        // Use socket directly so that the messages aren't sent to all of the
        // user's open browsers
        socket.emit('chat message', msg);
      });
    });

    socket.on('up next', () => {
      jub.getUpNext(list => {
        socket.emit('up next', list);
      });
    });

    socket.on('mute update', isMuted => {
      let user = sessionForSocket(socket).username;
      jub.updateMute(user, isMuted, userList => {
        emitUsersInfo(userList);
      });
    });

    // Chat message received from a client
    // TODO add user to message obj, based on socket session
    socket.on('chat message', clientMsgObj => {
      console.log('new chat message');
      chat.newChatMessage(clientMsgObj);
    });

    // Enqueue new video
    socket.on('video enqueue', (playlist, video) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.enqueueVideo(user, playlist, video);
      });
    });

    // User asks if it is DJing
    socket.on('user djing', () => {
      let user = sessionForSocket(socket).username;
      jub.userDjing(user, state => {
        whisper(user, 'user djing', state);
      });
    });

    // Add DJ
    socket.on('add dj', () => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.addDj(user);
      });
    });

    // Remove DJ
    socket.on('remove dj', () => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.removeDj(user);
      });
    });

    // Skip video
    socket.on('video skip', () => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.videoSkipped(user);
      });
    });

    // Like
    socket.on('like', () => {
      let user = sessionForSocket(socket).username;
      jub.userOpinion(user, true);
    });

    // Dislike
    socket.on('dislike', () => {
      let user = sessionForSocket(socket).username;
      jub.userOpinion(user, false);
    });

    // Shuffle
    socket.on('shuffle', (playlist, callback) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.shuffle(user, playlist, callback);
      });
    });

    // Delete tracks
    socket.on('delete tracks', (playlist, indices, callback) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.deleteTracks(user, playlist, indices, callback);
      });
    });

    // Send tracks to top of queue
    socket.on('send to top', (playlist, indices, callback) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.sendToTop(user, playlist, indices, callback);
      });
    });

    // Send tracks to bottom of queue
    socket.on('send to bottom', (playlist, indices, callback) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.sendToBottom(user, playlist, indices, callback);
      });
    });

    // Clip song in user's playlist
    socket.on('clip track', (playlist, selectedIndex, startTime, endTime) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.clipTrack(user, playlist, selectedIndex, startTime, endTime)
      });
    });

    // Dequeue video for user
    socket.on('video dequeue', playlist => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.dequeueVideo(user, playlist);
      });
    });

    // Enqueue an array of videos. TODO get rid of 'video enqueue'
    socket.on('videos enqueue', (playlist, videos) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.enqueueVideos(user, playlist, videos);
      });
    });

    // Client requested video state
    socket.on('video state', () => {
      // Send current state to that client
      emitVideoState(socket);
    });

    // Client requested queue state
    socket.on('queue', () => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        console.log('client requested queue state', user);
        // Send current state to that client
        emitQueueFor(user, socket);
      });
    });

    // Client requested playlists
    // TODO be clear about usage of socket-passing vs whisper
    socket.on('playlists', () => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        console.log('client requested playlists');
        emitPlaylistsFor(user);
      });
    });

    socket.on('preferences', () => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        console.log('client requested prefs');
        emitPreferencesFor(user);
      });
    });

    // Rename a playlist. Knows to create a new 'sandbox' if fromName is 'sandbox'
    socket.on('rename playlist', (fromName, toName) => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        console.log('user', user, 'wishes to rename from', fromName, 'to', toName);
        jub.renamePlaylist(user, fromName, toName);
      });
    });

    // Copy playlist
    socket.on('copy playlist', playlistName => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.copyPlaylist(user, playlistName);
      });
    });

    // Delete playlist
    socket.on('delete playlist', playlistName => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.deletePlaylist(user, playlistName, () => {
          emitPlaylistsFor(user);
        });
      });
    });

    socket.on('update user preferences', prefs => {
      ifValidAccountToken(socket, () => {
        let user = sessionForSocket(socket).username;
        jub.updateUserPreferences(user, prefs);
      });
    });

    // Client requested youtube search results -- perform the video search
    // and call the client's provided callback
    // TODO remove once clients are doing this
    socket.on('video search', (query, callback) => {
      ifValidAccountToken(socket, () => {
        console.log('searching for', query);
        jub.videoSearch(query, results => {
          callback(results);
        });
      });
    });

    socket.on('gapi key', callback => {
      ifValidAccountToken(socket, () => {
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
