var jub_util = require('./jub_util');
var util = require('util');
var _ = require('lodash');
var Set = require("collections/set");
var Map = require("collections/map");
var Deque = require("collections/deque");
var moment = require("moment");
var async = require("async");
require('./logging')(); // TODO accept logger as an argument
jub_util.monkey_patch();

// TODO collections module has incomplete documentation
// -> Replace these data structures with vanilla equivalents and leverage
//    lodash to get the functional goodies that collections was providing.
function JubDJ(config, gapi, chat, db) {
  var gapi = gapi;
  var chat = chat;
  var video_state = {};
  var dj_sched = [];             // circular buffer of users signed up to DJ
  var current_users = new Set([chat.bot.name]); // users present in room
  var users_seen = new Set();    // for forcing reloads
  var jub = this;

  // These will be set by the socketeer
  this.broadcast = function() {};
  this.whisper = function() {};

  chat.jub = jub;

  // map of { user: selected playlist len }
  var queue_len_map = function(callback) {
    async.reduce(dj_sched, {}, function(memo, user, cb){
      jub.fetch_playlists_for(user, function(lists, selected) {
        var len = ((_.find(lists, _.matchesProperty('name', selected)) || {}).videos || []).length;
        memo[user] = len;
        cb(null, memo);
      });
    }, function(err, result) {
      callback(result);
    });
  }

  // Rotate DJs until someone who has videos to play is first. Calls callback with next
  // dj if there was a valid one, otherwise calls callback with null
  var rotate_djs = function(callback) {
    queue_len_map(function(queue_lens) {
      var sum_queued = _.reduce(queue_lens, function(memo, len, dj) { return memo + len; }, 0);
      var next = null;
      if (sum_queued > 0) {
        do { 
          dj_sched.push(dj_sched.shift());
        } while (queue_lens[dj_sched[0]] == 0);
        next = dj_sched[0];
      }
      callback(next);
    });
  }

  var video_done = function() {
    return Date.now() > video_state.start_time + video_state.duration;
  }

  var broadcast_video_state = function() {
    if (video_state) {
      jub.broadcast('video state', jub.emittable_video_state());
    }
  }

  // Pop -> unshift for the user's selected playlist.
  // Calls callback with a copy of the popped video
  var rotate_selected_playlist = function(user, callback) {
    var next = {};
    var user_prefs = {};
    jub.fetch_playlists_for(user, function(lists, selected) {
      async.series([
        function(done) {
          db.fetchOrInitUserPreferences(user, function(prefs) {
            user_prefs = prefs;
            done();
          });
        },
        function(done) {
          jub.update_playlist_videos(user, selected, function(videos) {
            next = videos.shift();
            console.log('requeue?', selected, user_prefs.requeueVideos);
            if (next && !(selected == 'sandbox' && user_prefs.requeueVideos == false)) {
              videos.push(next);
            }
            return videos;
          }, done);
        },
        function(done) {
          callback(_.cloneDeep(next));
          done();
        },
      ]);
    });
  }

  // Periodically check the time so we can start the next video punctually.
  // When the time comes, pop the next DJ off the schedule and play his video.
  var rotate_videos = function() {
    // It's time to rotate videos or no video has ever been played
    if (video_done() || Object.keys(video_state).length == 0) {
      var last_dj = video_state.user;
      // Someone has a video to play. Rotate DJs, send the new DJ his
      // updated queue and broadcast the new video state.
      rotate_djs(function(next_dj) {
        // Someone has something to play
        if (next_dj) {
          rotate_selected_playlist(next_dj, function(next_video) {
            if (next_video) { jub.start_new_video(next_dj, next_video); }
            broadcast_video_state();
          });
        } else {
          // No one has anything to play, but someone may have just clicked
          // 'skip', so send back the updated state anyway.
          if (video_state && Object.keys(video_state).length > 0) {
            jub.clear_video_state();
            broadcast_video_state();
          }
        }
      });
    } // if time to rotate
  }
  var rotate_videos_interval = setInterval(rotate_videos, 1000);

  this.stop = function() {
    clearInterval(rotate_videos_interval);
  }

  // TODO duplication.  These are two separate functions because of the weirdness necessary to modify the mongo arrays
  // update_fn should accept the list of videos and return the list of videos
  // with any desired modifications.
  this.update_playlist_videos = function(user, playlist_name, update_fn, finale) {
    if (!(user && playlist_name)) {
      return console.error('insufficient args to update playlist');
    }
    async.series([
      // Fetch/create the playlist and call the update function
      function(done) {
        db.updatePlaylistVideos(user, playlist_name, function(videos, done_updating) {
          var updated = update_fn(videos);
          done_updating(updated, function(pl) { done(); });
        });
      },
      // Whisper the updated playlist back to the user
      function(done) {
        jub.fetch_playlists_for(user, function(lists, selected) {
          jub.whisper(user, 'playlists', lists, selected);
          done();
        });
      },
      function(done) {
        if (typeof finale == 'function') { finale(); }
        done();
      }
    ]);
  }

  // update_fn should accept the playlist and a `done` function, and can modify
  // in place (the return value is not used).
  // done_fn will be called after the DB transaction is done.
  this.update_playlist_meta = function(user, playlist_name, update_fn, done_fn) {
    if (!(user && playlist_name)) {
      return console.error('insufficient args to update playlist');
    }
    async.series([
      // Fetch/create the playlist and call the update function
      function(done) {
        db.updateOrCreatePlaylistMeta(user, playlist_name, function(playlist, done_updating) {
          update_fn(playlist);
          done_updating(playlist, function(pl) {
            done();
          });
        });
      },
      // Whisper the updated playlist back to the user
      function(done) {
        jub.fetch_playlists_for(user, function(lists, selected) {
          jub.whisper(user, 'playlists', lists);
          if (typeof done_fn == 'function') { done_fn(); }
          done();
        });
      }
    ]);
  }

  // `updates` is an object with a subset of the properties of the
  // userPreferences schema.
  this.update_user_preferences = function(user, updates) {
    console.log('updating user prefs', user, updates);
    db.updateOrCreateUserPreferences(user, updates, function(updated) {
      jub.whisper(user, 'preferences', updated);
    });
  }

  // Enqueue a single video for a user
  this.enqueue_video = function(user, playlist_name, video) {
    console.log('enqueue video', user, playlist_name, video);
    if (!(video.title && video.duration)) {
      return console.error('cannot enqueue video without title/duration', video);
    }
    jub.update_playlist_videos(user, playlist_name, function(videos) {
      videos.push(video);
      return videos;
    });
  }

  // Add an array of videos to a jub playlist
  this.enqueue_videos = function(user, playlist_name, videos) {
    console.log('enqueue videos:', user, playlist_name, util.inspect(videos));
    jub.update_playlist_videos(user, playlist_name, function(db_videos) {
      // Add each video
      for (video of videos) {
        if (video.title && video.duration) {
          db_videos.push(video);
        } else {
          console.error('cannot enqueue video without title/duration', video);
        }
      }
      return db_videos;
    });
  }

  this.dequeue_video = function(user, playlist_name) {
    jub.update_playlist_videos(user, playlist_name, function(db_videos) {
      db_videos.pop();
      return db_videos;
    });
  }

  // Used for both like and dislike
  this.user_opinion = function(user, like) {
    console.log('user appraises', user, like);
    if (video_done()) { return; }
    if (!video_state.hasOwnProperty('opinions')) {
      video_state['opinions'] = new Map();
    }
    var appr_map = video_state['opinions'];
    if (!appr_map.has(user)) {
      appr_map.set(user, like);
      chat.bot_say(user + ' ' + (like ? 'likes' : 'dislikes') + ' this video.');
      var channel = like ? 'num likes' : 'num dislikes'
      var value = appr_map.reduce(function(a, v, k) {
        return a + (v === like ? 1 : 0);
      }, 0);
      jub.broadcast(channel, value);
    }
  }

  this.shuffle = function(user, playlist_name) {
    console.log('shuffling for ', user, playlist_name);
    jub.update_playlist_videos(user, playlist_name, function(videos) {
      jub_util.knuth_shuffle(videos);
      return videos;
    });
  }

  this.delete_tracks = function(user, playlist_name, indices) {
    console.log('deleting tracks for ', user, indices);
    jub.update_playlist_videos(user, playlist_name, function(videos) {
      _.pullAt(videos, indices);
      return videos;
    });
  }

  this.send_to_top = function(user, playlist_name, indices) {
    console.log('sending tracks to top for', user, indices);
    jub.update_playlist_videos(user, playlist_name, function(videos) {
      return videos
        .partition(function(v, i) { return (indices.indexOf(i) > -1); })
        .flatten();
    });
  }

  this.send_to_bottom = function(user, playlist_name, indices) {
    console.log('sending tracks to bottom for', user, indices);
    jub.update_playlist_videos(user, playlist_name, function(videos) {
      return videos
        .partition(function(v, i) { return (indices.indexOf(i) === -1); })
        .flatten();
    });
  }

  // Allow users to skip their own videos; also allow anyone to skip a video
  // started by someone who has left the DJ rotation.
  this.video_skipped = function(user) {
    if (!video_state.id) return;
    console.log('user', user, 'tried to skip', video_state);
    if (user == video_state.user ||
        (video_state.user && dj_sched.indexOf(video_state.user) < 0)) {
      video_state.start_time = Date.now() - video_state.duration;
      chat.video_skipped(user);
      rotate_videos();
    }
  }

  // TODO maybe this function should also broadcast
  this.start_new_video = function(user, new_video) {
    video_state = _.merge({},  new_video);
    video_state.start_time = Date.now();
    video_state.user = user;
    chat.video_started(video_state);
    console.log("Updated video state: \"%s\"", video_state.title);
    console.log('next video is now', new_video);
  }

  this.clear_video_state = function() {
    console.log('clearing video state');
    video_state.id = null;
  }

  this.emittable_user_map = function() {
    return current_users.map(function(user) {
      return {
        name: user,
        color: chat.color_for(user)
      }
    });
  }

  this.emittable_video_state = function() {
    return {
      id: video_state.id,
      title: video_state.title,
      start_time: video_state.start_time,
      server_time: Date.now(),
      duration: video_state.duration,
      user: video_state.user,
      user_color: chat.color_for(video_state.user),
      opinions: video_state.opinions
    }
  }

  this.emittable_queue_for = function(user) {
    if (video_queues.has(user)) {
      return video_queues.get(user).toArray();
    }
  }

  // All of user's playlists
  // TODO this calls toObject and omit nestedly - we may want to do that
  // elsewhere when fetching from the DB and sending back to the client
  this.fetch_playlists_for = function(user, callback) {
    var selected = null;
    async.series([
      function(done) {
        db.fetchOrInitUserPreferences(user, function(fetched) {
          selected = fetched.selectedPlaylist;
          done();
        })
      },
      function(done) {
        db.fetchOrInitPlaylists(user, function(fetched) {
          var emittable = _.map(fetched.toObject(), function(pl) {
            var adj = _.omit(pl.toObject(), ['_id', '__v']);
            adj.videos = _.map(pl.videos.toObject(), function(v) {
              return _.omit(v, ['_id', '__v']);
            });
            return adj;
          });
          callback(emittable, selected);
          done();
        });
      },
    ]);
  }

  this.user_djing = function(user, callback) {
    callback(!!(dj_sched.indexOf(user || '') > -1));
  }

  // Includes `dj` state
  this.fetch_preferences_for = function(user, callback) {
    var emittable = {};
    db.fetchOrInitUserPreferences(user, function(fetched) {
      // Use the fetched color (or generate a random one)
      emittable.color = chat.color_for(user, fetched.color);
      emittable.requeueVideos = fetched.requeueVideos;
      emittable.selectedPlaylist = fetched.selectedPlaylist;
      callback(emittable);
    });
  }

  // Client wants to rename a playlist
  this.rename_playlist = function(user, from_name, to_name) {
    if (to_name == 'sandbox') { return; }
    console.log('renaming playlist');
    async.series([
      function(done) {
        // First change the name of the playlist
        jub.update_playlist_meta(user, from_name, function(playlist) {
          playlist.name = to_name;
        }, done);
      },
      function(done) {
        // Now create a new sandbox playlist if needed
        if (from_name == 'sandbox') {
          jub.update_playlist_meta(user, 'sandbox', function(playlist) {}, done);
        } else {
          done();
        }
      },
      function(done) {
        // Make sure the new playlist is selected
        jub.update_user_preferences(user, { selectedPlaylist: to_name }, done);
      }
    ]);
  }

  function new_playlist_name(user, base_name, callback) {
    db.fetchOrInitPlaylists(user, function(lists) {
      var existing = _.map(lists, function(pl) { return pl.name });
      var new_name = base_name == 'sandbox' ? 'New playlist' : base_name;
      var num = 1;
      while (_.contains(existing, new_name  + ' ' + num)) {
        num = num + 1;
      }
      callback(new_name + ' ' + num);
    });
  }

  this.copy_playlist = function(user, playlist_name) {
    console.log('copying playlist', user, playlist_name);
    var new_name = 'ERROR';
    var videos_to_copy = [];
    async.series([
      function(done) {
        new_name = new_playlist_name(user, playlist_name, function(result) {
          new_name = result;
          done();
        });
      },
      function(done) {
        db.updatePlaylistVideos(user, playlist_name, function(videos, done_updating) {
          videos_to_copy = _.cloneDeep(videos);
          done_updating(videos, function(pl) { done(); });
        });
      },
      function(done) {
        // Create the new playlist
        jub.update_playlist_meta(user, new_name, function(playlist) {}, done);
      },
      function(done) {
        // Populate the new playlist
        jub.update_playlist_videos(user, new_name, function(videos) {
          return _.cloneDeep(videos_to_copy);
        }, done);
      },
      function(done) {
        // Make sure the new playlist is selected
        jub.update_user_preferences(user, { selectedPlaylist: new_name }, done);
      }
    ]);
  }

  this.delete_playlist = function(user, playlist_name, whisper_to_client) {
    if (playlist_name != 'sandbox') {
      db.deletePlaylist(user, playlist_name, whisper_to_client);
    }
  }

  // Add the user to the end of the rotation if it's not already in the
  // rotation.
  this.add_dj = function(user) {
    var index = dj_sched.indexOf(user);
    if (index == -1) {
      dj_sched.push(user);
    }
    console.log('added DJ', user, ', now dj_sched', dj_sched);
  }

  // Remove the user from the rotation if it's there
  this.remove_dj = function(user) {
    var index = dj_sched.indexOf(user);
    if (index > -1) {
      dj_sched.splice(index, 1);
    }
    console.log('removed DJ', user, ', now dj_sched', dj_sched);
  }

  this.add_user = function(user, socket, callback) {
    if (user) {
      current_users.add(user);
      if (!users_seen.has(user)) {
        users_seen.add(user);
        console.log('force reload', user)
        socket.emit('force reload');
      }
      // Could replace callback with broadcast
      callback(jub.emittable_user_map());
    }
  }

  this.set_current_users = function(users, callback) {
    current_users.clear();
    current_users.add(chat.bot.name);
    current_users.addEach(users);
    callback(jub.emittable_user_map());
  }

  // User loads page, and proposes a username for itself based on cookies.
  // Send back initial data (pre-DB), including (and currently limited to)
  // their actual username (likely the same as their proposed one).
  // Also send them the day's cached chat.
  this.user_loaded = function(user, callback) {
    console.log('user loaded', user);

    // Generate a random username if none is provided
    if (!user) {
      user = chat.gen_username()
    }

    // Don't need to force reload this user
    users_seen.add(user);

    var emittable = { name: user };
    callback(emittable);

    // Send the day's chat history to the user
    chat.load_chat_cache(config.chat_cache_limit, function(msg_objs) {
      console.log('loaded chat cache for', user, msg_objs.length);
      msg_objs.forEach(function(msg_obj) {
        chat.whisper_chat(user, msg_obj);
      });
    });
  }

  this.video_search = function(query, callback) {
    gapi.video_search(query, callback);
  }
}

module.exports = function(config, gapi, chat, db) {
  var jub = new JubDJ(config, gapi, chat, db);
  jub.add_dj(chat.bot.name);
  return jub
}
