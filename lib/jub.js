var jubUtil = require('./jub_util');
var util = require('util');
var _ = require('lodash');
var Set = require("collections/set");
var Map = require("collections/map");
var Deque = require("collections/deque");
var moment = require("moment");
var async = require("async");
require('./logging')(); // TODO accept logger as an argument
jubUtil.monkeyPatch();

// TODO collections module has incomplete documentation
// -> Replace these data structures with vanilla equivalents and leverage
//    lodash to get the functional goodies that collections was providing.
function JubDJ(config, gapi, chat, db) {
  var gapi = gapi;
  var chat = chat;
  var videoState = {};
  var djSched = [];             // circular buffer of users signed up to DJ
  var currentUsers = new Set([chat.bot.name]); // users present in room
  var usersSeen = new Set();    // for forcing reloads
  var jub = this;

  // These will be set by the socketeer
  this.broadcast = function() {};
  this.whisper = function() {};
  this.stopFns = [db.stop];             // List of functions to call when shutting down

  chat.jub = jub;

  // map of { user: selected playlist len }
  var queueLenMap = function(callback) {
    async.reduce(djSched, {}, function(memo, user, cb){
      jub.fetchPlaylistsFor(user, function(lists, selected) {
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
  var rotateDjs = function(callback) {
    queueLenMap(function(queueLens) {
      var sumQueued = _.reduce(queueLens, function(memo, len, dj) { return memo + len; }, 0);
      var next = null;
      if (sumQueued > 0) {
        do {
          djSched.push(djSched.shift());
        } while (queueLens[djSched[0]] == 0);
        next = djSched[0];
      }
      callback(next);
    });
  }

  var videoDone = function() {
    return Date.now() > videoState.startTime + videoState.duration;
  }

  var broadcastVideoState = function() {
    if (videoState) {
      jub.broadcast('video state', jub.emittableVideoState());
    }
  }

  // Pop -> unshift for the user's selected playlist.
  // Calls callback with a copy of the popped video
  var rotateSelectedPlaylist = function(user, callback) {
    var next = {};
    var userPrefs = {};
    jub.fetchPlaylistsFor(user, function(lists, selected) {
      async.series([
        function(done) {
          db.fetchOrInitUserPreferences(user, function(prefs) {
            userPrefs = prefs;
            done();
          });
        },
        function(done) {
          jub.updatePlaylistVideos(user, selected, function(videos) {
            next = videos.shift();
            if (next && !(selected == 'sandbox' && userPrefs.requeueVideos == false)) {
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
  var rotateVideos = function() {
    // It's time to rotate videos or no video has ever been played
    if (videoDone() || Object.keys(videoState).length == 0) {
      // Someone has a video to play. Rotate DJs, send the new DJ his
      // updated queue and broadcast the new video state.
      rotateDjs(function(nextDj) {
        // Someone has something to play
        if (nextDj) {
          rotateSelectedPlaylist(nextDj, function(nextVideo) {
            if (nextVideo) {
              jub.startNewVideo(nextDj, nextVideo);
            }
            broadcastVideoState();
          });
        } else {
          // No one has anything to play, but someone may have just clicked
          // 'skip', so send back the updated state anyway.
          if (videoState && Object.keys(videoState).length > 0) {
            if (videoState.id != null) {
              jub.clearVideoState();
              broadcastVideoState();
            }
          }
        }
      });
    } // if time to rotate
  }
  var rotateVideosInterval = setInterval(rotateVideos, 1000);

  this.stop = function() {
    console.log('jub stopping');
    clearInterval(rotateVideosInterval);
    _.each(jub.stopFns, function(fn) { fn(); });
  }

  // TODO duplication.  These are two separate functions because of the weirdness necessary to modify the mongo arrays
  // updateFn should accept the list of videos and return the list of videos
  // with any desired modifications.
  this.updatePlaylistVideos = function(user, playlistName, updateFn, finale) {
    if (!(user && playlistName)) {
      return console.error('insufficient args to update playlist');
    }
    async.series([
      // Fetch/create the playlist and call the update function
      function(done) {
        db.updatePlaylistVideos(user, playlistName, function(videos, doneUpdating) {
          var updated = updateFn(videos);
          doneUpdating(updated, function(pl) { done(); });
        });
      },
      // Whisper the updated playlist back to the user
      function(done) {
        jub.fetchPlaylistsFor(user, function(lists, selected) {
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

  // updateFn should accept the playlist and a `done` function, and can modify
  // in place (the return value is not used).
  // doneFn will be called after the DB transaction is done.
  this.updatePlaylistMeta = function(user, playlistName, updateFn, doneFn) {
    if (!(user && playlistName)) {
      return console.error('insufficient args to update playlist');
    }
    async.series([
      // Fetch/create the playlist and call the update function
      function(done) {
        db.updateOrCreatePlaylistMeta(user, playlistName, function(playlist, doneUpdating) {
          updateFn(playlist);
          doneUpdating(playlist, function(pl) {
            done();
          });
        });
      },
      // Whisper the updated playlist back to the user
      function(done) {
        jub.fetchPlaylistsFor(user, function(lists, selected) {
          jub.whisper(user, 'playlists', lists);
          if (typeof doneFn == 'function') { doneFn(); }
          done();
        });
      }
    ]);
  }

  // `updates` is an object with a subset of the properties of the
  // userPreferences schema.
  this.updateUserPreferences = function(user, updates) {
    console.log('updating user prefs', user, updates);
    db.updateOrCreateUserPreferences(user, updates, function(updated) {
      jub.whisper(user, 'preferences', updated);
    });
  }

  // Enqueue a single video for a user
  this.enqueueVideo = function(user, playlistName, video) {
    console.log('enqueue video', user, playlistName, video);
    if (!(video.title && video.duration)) {
      return console.error('cannot enqueue video without title/duration', video);
    }
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      videos.push(video);
      return videos;
    });
  }

  // Add an array of videos to a jub playlist
  this.enqueueVideos = function(user, playlistName, videos) {
    console.log('enqueue videos:', user, playlistName, util.inspect(videos));
    jub.updatePlaylistVideos(user, playlistName, function(dbVideos) {
      // Add each video
      for (video of videos) {
        if (video.title && video.duration) {
          dbVideos.push(video);
        } else {
          console.error('cannot enqueue video without title/duration', video);
        }
      }
      return dbVideos;
    });
  }

  this.dequeueVideo = function(user, playlistName) {
    jub.updatePlaylistVideos(user, playlistName, function(dbVideos) {
      dbVideos.pop();
      return dbVideos;
    });
  }

  // Used for both like and dislike
  this.userOpinion = function(user, like) {
    console.log('user appraises', user, like);
    if (videoDone()) { return; }
    if (!videoState.hasOwnProperty('opinions')) {
      videoState['opinions'] = new Map();
    }
    var apprMap = videoState['opinions'];
    if (!apprMap.has(user)) {
      apprMap.set(user, like);
      chat.botSay(user + ' ' + (like ? 'likes' : 'dislikes') + ' this video.');
      var channel = like ? 'num likes' : 'num dislikes'
      var value = apprMap.reduce(function(a, v, k) {
        return a + (v === like ? 1 : 0);
      }, 0);
      jub.broadcast(channel, value);
    }
  }

  this.shuffle = function(user, playlistName) {
    console.log('shuffling for ', user, playlistName);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      jubUtil.knuthShuffle(videos);
      return videos;
    });
  }

  this.deleteTracks = function(user, playlistName, indices) {
    console.log('deleting tracks for ', user, indices);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      _.pullAt(videos, indices);
      return videos;
    });
  }

  this.sendToTop = function(user, playlistName, indices) {
    console.log('sending tracks to top for', user, indices);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      return videos
        .partition(function(v, i) { return (indices.indexOf(i) > -1); })
        .flatten();
    });
  }

  this.sendToBottom = function(user, playlistName, indices) {
    console.log('sending tracks to bottom for', user, indices);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      return videos
        .partition(function(v, i) { return (indices.indexOf(i) === -1); })
        .flatten();
    });
  }

  // Allow users to skip their own videos; also allow anyone to skip a video
  // started by someone who has left the DJ rotation.
  this.videoSkipped = function(user) {
    if (!videoState.id) return;
    console.log('user', user, 'tried to skip', videoState);
    if (user == videoState.user ||
        (videoState.user && djSched.indexOf(videoState.user) < 0)) {
      videoState.startTime = Date.now() - videoState.duration;
      chat.videoSkipped(user);
    }
  }

  // TODO maybe this function should also broadcast
  this.startNewVideo = function(user, newVideo) {
    videoState = _.merge({},  newVideo);
    videoState.startTime = Date.now();
    videoState.user = user;
    chat.videoStarted(videoState);
    console.log("Updated video state: \"%s\"", videoState.title);
    console.log('next video is now', newVideo);
  }

  this.clearVideoState = function() {
    console.log('clearing video state');
    videoState.id = null;
  }

  this.emittableUserMap = function() {
    return currentUsers.map(function(user) {
      return {
        name: user,
        color: chat.colorFor(user)
      }
    });
  }

  this.emittableVideoState = function() {
    return {
      id: videoState.id,
      title: videoState.title,
      startTime: videoState.startTime,
      serverTime: Date.now(),
      duration: videoState.duration,
      user: videoState.user,
      userColor: chat.colorFor(videoState.user),
      opinions: videoState.opinions
    }
  }

  this.emittableQueueFor = function(user) {
    if (videoQueues.has(user)) {
      return videoQueues.get(user).toArray();
    }
  }

  // All of user's playlists
  // TODO this calls toObject and omit nestedly - we may want to do that
  // elsewhere when fetching from the DB and sending back to the client
  this.fetchPlaylistsFor = function(user, callback) {
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

  this.userDjing = function(user, callback) {
    callback(!!(djSched.indexOf(user || '') > -1));
  }

  // Includes `dj` state
  this.fetchPreferencesFor = function(user, callback) {
    var emittable = {};
    db.fetchOrInitUserPreferences(user, function(fetched) {
      // Use the fetched color (or generate a random one)
      emittable.color = chat.colorFor(user, fetched.color);
      emittable.requeueVideos = fetched.requeueVideos;
      emittable.selectedPlaylist = fetched.selectedPlaylist;
      emittable.showChatImages = fetched.showChatImages;
      callback(emittable);
    });
  }

  // Client wants to rename a playlist
  this.renamePlaylist = function(user, fromName, toName) {
    if (toName == 'sandbox') { return; }
    console.log('renaming playlist');
    async.series([
      function(done) {
        // First change the name of the playlist
        jub.updatePlaylistMeta(user, fromName, function(playlist) {
          playlist.name = toName;
        }, done);
      },
      function(done) {
        // Now create a new sandbox playlist if needed
        if (fromName == 'sandbox') {
          jub.updatePlaylistMeta(user, 'sandbox', function(playlist) {}, done);
        } else {
          done();
        }
      },
      function(done) {
        // Make sure the new playlist is selected
        jub.updateUserPreferences(user, { selectedPlaylist: toName }, done);
      }
    ]);
  }

  function newPlaylistName(user, baseName, callback) {
    db.fetchOrInitPlaylists(user, function(lists) {
      var existing = _.map(lists, function(pl) { return pl.name });
      var newName = baseName == 'sandbox' ? 'New playlist' : baseName;
      var num = 1;
      while (_.contains(existing, newName + ' ' + num)) { // TODO this is incorrect
        num = num + 1;
      }
      callback(newName + ' ' + num);
    });
  }

  this.copyPlaylist = function(user, playlistName) {
    console.log('copying playlist', user, playlistName);
    var newName = 'ERROR';
    var videosToCopy = [];
    async.series([
      function(done) {
        newName = newPlaylistName(user, playlistName, function(result) {
          newName = result;
          done();
        });
      },
      function(done) {
        db.updatePlaylistVideos(user, playlistName, function(videos, doneUpdating) {
          videosToCopy = _.cloneDeep(videos);
          doneUpdating(videos, function(pl) { done(); });
        });
      },
      function(done) {
        // Create the new playlist
        jub.updatePlaylistMeta(user, newName, function(playlist) {}, done);
      },
      function(done) {
        // Populate the new playlist
        jub.updatePlaylistVideos(user, newName, function(videos) {
          return _.cloneDeep(videosToCopy);
        }, done);
      },
      function(done) {
        // Make sure the new playlist is selected
        jub.updateUserPreferences(user, { selectedPlaylist: newName }, done);
      }
    ]);
  }

  this.deletePlaylist = function(user, playlistName, whisperToClient) {
    if (playlistName != 'sandbox') {
      db.deletePlaylist(user, playlistName, whisperToClient);
    }
  }

  // Add the user to the end of the rotation if it's not already in the
  // rotation.
  this.addDj = function(user) {
    var index = djSched.indexOf(user);
    if (index == -1) {
      djSched.push(user);
    }
    console.log('added DJ', user, ', now djSched', djSched);
  }

  // Remove the user from the rotation if it's there
  this.removeDj = function(user) {
    var index = djSched.indexOf(user);
    if (index > -1) {
      djSched.splice(index, 1);
    }
    console.log('removed DJ', user, ', now djSched', djSched);
  }

  this.addUser = function(user, socket, callback) {
    if (user) {
      currentUsers.add(user);
      if (!usersSeen.has(user)) {
        usersSeen.add(user);
        console.log('force reload', user)
        socket.emit('force reload');
      }
      // Could replace callback with broadcast
      callback(jub.emittableUserMap());
    }
  }

  this.setCurrentUsers = function(users, callback) {
    currentUsers.clear();
    currentUsers.add(chat.bot.name);
    currentUsers.addEach(users);
    callback(jub.emittableUserMap());
  }

  // User loads page, and proposes a username for itself based on cookies.
  // Send back initial data (pre-DB), including (and currently limited to)
  // their actual username (likely the same as their proposed one).
  // Also send them the day's cached chat.
  this.userLoaded = function(user, callback) {
    console.log('user loaded', user);

    // Generate a random username if none is provided
    if (!user) {
      user = chat.genUsername()
    }

    // Don't need to force reload this user
    usersSeen.add(user);

    var emittable = { name: user };
    callback(emittable);
  }

  this.getChatCache = function(callback) {
    // Send the day's chat history to the user
    chat.loadChatCache(config.chat_cache_limit, function(msgObjs) {
      msgObjs.forEach(function(msgObj) {
        callback(msgObj);
      });
    });
  }

  this.videoSearch = function(query, callback) {
    gapi.videoSearch(query, callback);
  }
}

module.exports = function(config, gapi, chat, db) {
  var jub = new JubDJ(config, gapi, chat, db);
  if (process.env.TEST) { jub.addDj(chat.bot.name); }
  return jub
}
