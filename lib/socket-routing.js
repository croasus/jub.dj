var jub_util = require('./jub_util');
jub_util.monkey_patch();
var util = require('util');
require('./logging')();
var Set = require("collections/set");

// Future of socket routing...
// Options:
//   1) big data map, here, mapping channel names to functions in different modules
//   2) everything remains in code form
//
//
// For historical reasons, the jub does not have a reference to this socketeer,
// but we will give it a couple of functions
function Socketeer(jub, chat, config, io) {

  var user_to_sockets = {};

  function jub_update_users() {
    jub.set_current_users(Object.keys(user_to_sockets), emit_users);
  }

  function trim_sockets() {
    for (user in user_to_sockets) {
      user_to_sockets[user].forEach(function(socket) {
        if (socket.disconnected) {
          user_to_sockets[user].delete(socket);
          console.log('trimmed a socket from', user,
                      'now', user_to_sockets[user].length);
        }
      });
    }
    jub_update_users();
  }
  var trim_interval = setInterval(trim_sockets, 3001);

  function stop() {
    console.log("socket-routing stopping");
    clearInterval(trim_interval);
  }
  jub.stop_fns.push(stop);

  // Clear socket map and ping users
  function refresh_users() {
    jub_util.clear_obj(user_to_sockets);
    ping_users();
  }

  function broadcast(channel, message) {
    io.emit(channel, message);
  }

  function whisper(user, channel, message) {
    if (user_to_sockets[user]) {
      user_to_sockets[user].forEach(function(socket) {
        socket.emit(channel, message);
      });
    }
  }

  // Give hooks to jub and chat
  for (x of [jub, chat]) {
    x.broadcast = broadcast;
    x.whisper = whisper;
  }

  function emit_users(user_list) {
    io.emit('current users', user_list);
  }

  function emit_chat(msg) {
    io.emit('chat message', msg);
  }

  // Pass in `io` for broadcast; `socket` for direct message
  function emit_video_state(sockets) {
    sockets.emit('video state', jub.emittable_video_state());
  }

  function emit_queue_for(user, socket) {
    socket.emit('queue', jub.emittable_queue_for(user));
  }

  function emit_playlists_for(user) {
    jub.fetch_playlists_for(user, function(lists) {
      whisper(user, 'playlists', lists);
    });
  }

  function emit_preferences_for(user) {
    jub.fetch_preferences_for(user, function(prefs) {
      console.log('emitting', user, prefs);
      whisper(user, 'preferences', prefs);
    });
  }

  // Initiates a roll call; client sockets respond indicating presence
  function ping_users() {
    io.emit('ping users', 0);
  }

  function add_user_socket(user, socket) {
    if (!user_to_sockets[user]) {
      user_to_sockets[user] = new Set();
    }
    user_to_sockets[user].add(socket);
  }

  io.on('connection', function(socket) {

    // User connected ('connection' above)
    console.log('client connected: %s', socket.conn.remoteAddress);
    ping_users();

    // User disconnected
    socket.on('disconnect', function() {
      console.log('socket disconnected: %s', socket.conn.remoteAddress);
      refresh_users();
    });

    // A user just loaded the page; send them a welcome message. Callback is
    // for sending the user's data back to it.
    socket.on('user loaded', function(user, client_cb) {
      // Validate, modify (if necessary), store and return the user's info
      jub.user_loaded(user, function(info) {

        // Send the user its info (only `name` is used)
        client_cb(info);

        // Keep track of this socket by its user
        add_user_socket(info.name, socket);

        // Send the user a welcome message in chat
        chat.welcome(info.name, function(msg) {
          // Use socket directly so that the message isn't sent to all of the
          // user's open browsers
          socket.emit('chat message', msg);
        });

        jub_update_users();
      });
    });

    socket.on('chat cache', function() {
      jub.get_chat_cache(function(msg) {
        // Use socket directly so that the messages aren't sent to all of the
        // user's open browsers
        socket.emit('chat message', msg);
      });
    });

    // A user updated its name
    socket.on('user update', function(user) {
      if (user) {
        add_user_socket(user, socket);
        refresh_users();
      }
    });

    // A user reported presence
    socket.on('user present', function(user) {
      if (user) {
        add_user_socket(user, socket);
        jub.add_user(user, socket, function(user_list) {
          emit_users(user_list);
        });
      }
    });

    // Chat message received from a client
    socket.on('chat message', function(client_msg_obj) {
      chat.new_chat_message(client_msg_obj);
    });

    // Enqueue new video
    socket.on('video enqueue', function(user, playlist, video) {
      jub.enqueue_video(user, playlist, video);
    });

    // User asks if it is DJing
    socket.on('user djing', function(user) {
      jub.user_djing(user, function(state) {
        whisper(user, 'user djing', state);
      });
    });

    // Add DJ
    socket.on('add dj', function(user) {
      jub.add_dj(user);
    });

    // Remove DJ
    socket.on('remove dj', function(user) {
      jub.remove_dj(user);
    });

    // Skip video
    socket.on('video skip', function(user) {
      jub.video_skipped(user);
    });

    // Like
    socket.on('like', function(user) {
      jub.user_opinion(user, true);
    });

    // Dislike
    socket.on('dislike', function(user) {
      jub.user_opinion(user, false);
    });

    // Shuffle
    socket.on('shuffle', function(user, playlist, callback) {
      jub.shuffle(user, playlist, callback);
    });

    // Delete tracks
    socket.on('delete tracks', function(user, playlist, indices, callback) {
      jub.delete_tracks(user, playlist, indices, callback);
    });

    // Send tracks to top of queue
    socket.on('send to top', function(user, playlist, indices, callback) {
      jub.send_to_top(user, playlist, indices, callback);
    });

    // Send tracks to bottom of queue
    socket.on('send to bottom', function(user, playlist, indices, callback) {
      jub.send_to_bottom(user, playlist, indices, callback);
    });

    // Dequeue video for user
    socket.on('video dequeue', function(user, playlist) {
      jub.dequeue_video(user, playlist);
    });

    // Enqueue an array of videos. TODO get rid of 'video enqueue'
    socket.on('videos enqueue', function(user, playlist, videos) {
      jub.enqueue_videos(user, playlist, videos);
    });

    // Client requested video state
    socket.on('video state', function() {
      // Send current state to that client
      emit_video_state(socket);
    });

    // Client requested queue state
    socket.on('queue', function(user) {
      console.log('client requested queue state', user);
      // Send current state to that client
      emit_queue_for(user, socket);
    });

    // Client requested playlists
    // TODO be clear about usage of socket-passing vs whisper
    socket.on('playlists', function(user) {
      console.log('client requested playlists', user);
      emit_playlists_for(user);
    });

    socket.on('preferences', function(user) {
      console.log('client requested preferences', user);
      emit_preferences_for(user);
    });

    // Rename a playlist. Knows to create a new 'sandbox' if from_name is 'sandbox'
    socket.on('rename playlist', function(user, from_name, to_name) {
      console.log('user', user, 'wishes to rename from', from_name, 'to', to_name);
      jub.rename_playlist(user, from_name, to_name);
    });

    // Copy playlist
    socket.on('copy playlist', function(user, playlist_name) {
      jub.copy_playlist(user, playlist_name);
    });

    // Delete playlist
    socket.on('delete playlist', function(user, playlist_name) {
      jub.delete_playlist(user, playlist_name, function() {
        emit_playlists_for(user);
      });
    });

    socket.on('update user preferences', function(user, prefs) {
      jub.update_user_preferences(user, prefs);
    });

    // Client requested youtube search results -- perform the video search
    // and call the client's provided callback
    // TODO remove once clients are doing this
    socket.on('video search', function(query, callback) {
      console.log('searching for', query);
      jub.video_search(query, function(results) {
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

module.exports = function(jub, chat, config, io) {
  return new Socketeer(jub, chat, config, io);
}
