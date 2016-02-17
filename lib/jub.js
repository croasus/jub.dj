var jubUtil = require('./jub_util');
var util = require('util');
var _ = require('lodash');
var Set = require("collections/set");
var Map = require("collections/map");
var Deque = require("collections/deque");
var moment = require("moment");
var async = require("async");
var karma = require('./karma');
var lock = require('./locked_function');
require('./logging')(); // TODO accept logger as an argument
jubUtil.monkeyPatch();

// TODO collections module has incomplete documentation
// -> Replace these data structures with vanilla equivalents and leverage
//    lodash to get the functional goodies that collections was providing.
function JubDJ(config, gapi, chat, db) {

  // rotateVideos is called periodically, and protected by a mutex with a timeout
  var ROTATE_VIDEOS_INTERVAL = 500;
  var ROTATE_VIDEOS_LOCK_TIMEOUT = 10 * 1000;

  // Number of room-queued videos to show
  var UP_NEXT_LEN = 10;

  // After DJ leaves room before removing from rotation
  var KICK_DJ_TIMEOUT = 10 * 1000;

  var jub = this;
  var videoState = {};
  var djSched = [];             // circular buffer of users signed up to DJ
  var currentUsers = new Set([chat.bot.name]); // users present in room
  var usersSeen = new Set();    // for forcing reloads
  var upNext = [];              // keeps track of upcoming videos

  // These will be set by the socketeer
  this.broadcast = function() {};
  this.whisper = function() {};
  this.stopFns = [db.stop];             // List of functions to call when shutting down

  chat.jub = jub;

  // Map of current DJs to their respective queues
  var queueMap = function(callback, errCb) {
    async.reduce(djSched, {}, function(memo, user, next){
      jub.fetchPlaylistsFor(user, function(lists, selected) {
        memo[user] = (_.find(lists, _.matchesProperty('name', selected)) || {}).videos;
        next(null, memo);
      }, errCb);
    }, function(err, result) {
      if (err) { return errCb(err); }
      callback(result);
    });
  };

  // Map of current DJs to their respective queue lengths
  var queueLenMap = function(callback, errCb) {
    queueMap(function(map) {
      var lenMap = _.reduce(map, function(result, queue, user) {
        result[user] = queue.length;
        return result;
      }, {});
      callback(lenMap);
    }, errCb);
  };

  // Rotate DJs until someone who has videos to play is first. Calls callback with next
  // dj if there was a valid one, otherwise calls callback with null
  var rotateDjs = function(callback, errCb) {
    queueLenMap(function(queueLens) {
      var sumQueued = _.reduce(queueLens, function(memo, len, dj) { return memo + len; }, 0);
      var next = null;
      if (sumQueued > 0) {
        do {
          djSched.push(djSched.shift());
        } while (queueLens[djSched[0]] === 0);
        next = djSched[0];
      }
      callback(next);
    }, errCb);
  };

  var videoDone = function() {
    return Date.now() > videoState.startTime + videoState.duration;
  };

  var broadcastVideoState = function() {
    if (videoState) {
      jub.broadcast('video state', jub.emittableVideoState());
    }
  };

  // Pop -> unshift for the user's selected playlist.
  // Calls callback with a copy of the popped video
  var rotateSelectedPlaylist = function(user, callback, errCb) {
    var nextVideo = {};
    var userPrefs = {};
    jub.fetchPlaylistsFor(user, function(lists, selected) {
      async.series([
        function(done) {
          db.fetchOrInitUserPreferences(user, function(prefs) {
            userPrefs = prefs;
            done();
          }, errCb);
        },
        function(done) {
          jub.updatePlaylistVideos(user, selected, function(videos) {
            nextVideo = videos.shift();
            if (nextVideo && !(selected == 'sandbox' && userPrefs.requeueVideos === false)) {
              videos.push(nextVideo);
            }
            return videos;
          }, done, errCb);
        },
        function(done) {
          callback(_.cloneDeep(nextVideo));
          done();
        }
      ]);
    }, errCb);
  };

  // Periodically check the time so we can start the next video punctually.
  // When the time comes, pop the next DJ off the schedule and play his video.
  // Function locks itself to avoid reentry during the asynchronous chain of
  // DB accesses.
  // TODO could still be neatened up with async module
  var rotateVideos = lock.passThrough(function(release) {
    // Return unless time to rotate videos or no video has ever been played
    if (!(videoDone() || Object.keys(videoState).length === 0)) { return release(); }

    // Someone has a video to play. Rotate DJs, send the new DJ their
    // updated queue and broadcast the new video state.
    rotateDjs(function(nextDj) {
      // Someone has something to play
      if (nextDj) {
        rotateSelectedPlaylist(nextDj, function(nextVideo) {
          if (nextVideo) {
            jub.startNewVideo(nextDj, nextVideo);
          }
          updateUpNext();
          broadcastVideoState();
          release();
        }, release);
      } else {
        // No one has anything to play, but someone may have just clicked
        // 'skip', so send back the updated state anyway.
        if (videoState && Object.keys(videoState).length > 0) {
          if (videoState.id !== null) {
            jub.clearVideoState();
            updateUpNext();
            broadcastVideoState();
          }
        }
        release();
      }
    }, release);
  }, { timeout: ROTATE_VIDEOS_LOCK_TIMEOUT });
  var rotateVideosInterval = setInterval(rotateVideos, ROTATE_VIDEOS_INTERVAL);

  this.stop = function() {
    console.log('jub stopping');
    clearInterval(rotateVideosInterval);
    _.each(jub.stopFns, function(fn) { fn(); });
  };

  // Calls back with a list of the next `len` videos, assuming the current
  // DJ schedule
  var computeUpNext = lock.queued(function(release, len, callback, errCb) {
    queueMap(function(qs) {
      for (var user in qs) {
        // queueMap does not sort for us
        qs[user] = _.sortBy(qs[user], function(x) { return x.position; });
      }
      var list = [];
      var numVideos = _.reduce(qs, function(a,v,k) { return a + v.length; }, 0);
      if (numVideos > 0) {
        var djs = _.cloneDeep(djSched);
        console.log("djs", djSched);
        djs.push(djs.shift());         // don't start with the current DJ
        while (list.length < len) {
          var nextDj = djs[0];
          var nextVideo = qs[nextDj][0];
          nextVideo.user = nextDj;
          nextVideo.userColor = chat.colorFor(nextDj);
          list.push(nextVideo);
          qs[nextDj].push(qs[nextDj].shift());
          djs.push(djs.shift());
        }
      }
      callback(list);
      release();
    }, function(err) {
      release();
      errCb(err);
    });
  }, { timeout: 10000 });

  // This should be called whenever someone makes a change to one of their
  // playlists
  var updateUpNext = function(release) {
    console.log("updateUpNext");
    computeUpNext(UP_NEXT_LEN, function(list) {
      upNext = list;
      console.log("upnext updated, broadcasting", list);
      jub.broadcast('up next', list);
    }, function(err) {
      console.error("updateUpNext failed", err);
    });
  };

  this.getUpNext = function(callback) {
    console.log("getUpNext");
    callback(upNext);
  };

  // TODO duplication.  These are two separate functions because of the weirdness necessary to modify the mongo arrays
  // updateFn should accept the list of videos and return the list of videos
  // with any desired modifications.
  this.updatePlaylistVideos = function(user, playlistName, updateFn, finale, errCb) {
    if (!(user && playlistName)) {
      return console.error('insufficient args to update playlist');
    }
    async.series([
      // Fetch/create the playlist and call the update function
      function(done) {
        db.updatePlaylistVideos(user, playlistName, function(videos, doneUpdating) {
          var updated = updateFn(videos);
          doneUpdating(updated, function(pl) { done(); });
        }, errCb);
      },
      // Whisper the updated playlist back to the user
      function(done) {
        jub.fetchPlaylistsFor(user, function(lists, selected) {
          jub.whisper(user, 'playlists', lists, selected);
          done();
        }, errCb);
      },
      function(done) {
        if (typeof finale == 'function') { finale(); }
        done();
      },
      function(done) {
        // Recompute 'up next' list
        updateUpNext();
      }
    ]);
  };

  // updateFn should accept the playlist and a `done` function, and can modify
  // in place (the return value is not used).
  // doneFn will be called after the DB transaction is done.
  this.updatePlaylistMeta = function(user, playlistName, updateFn, doneFn, errCb) {
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
        }, errCb);
      },
      // Whisper the updated playlist back to the user
      function(done) {
        jub.fetchPlaylistsFor(user, function(lists, selected) {
          jub.whisper(user, 'playlists', lists);
          if (typeof doneFn == 'function') { doneFn(); }
          done();
        }, errCb);
      }
    ]);
  };

  // `updates` is an object with a subset of the properties of the
  // userPreferences schema.
  this.updateUserPreferences = function(user, updates, done, errCb) {
    console.log('updating user prefs', user, updates);
    db.updateOrCreateUserPreferences(user, updates, function(updated) {
      jub.whisper(user, 'preferences', updated);
      updateUpNext(); // User may have switched selected playlist
      done();
    }, errCb);
  };

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
  };

  // Add an array of videos to a jub playlist
  this.enqueueVideos = function(user, playlistName, videos) {
    console.log('enqueue videos:', user, playlistName, util.inspect(videos));
    jub.updatePlaylistVideos(user, playlistName, function(dbVideos) {
      // Add each video
      for (var video of videos) {
        if (video.title && video.duration) {
          dbVideos.push(video);
        } else {
          console.error('cannot enqueue video without title/duration', video);
        }
      }
      return dbVideos;
    });
  };

  this.dequeueVideo = function(user, playlistName) {
    jub.updatePlaylistVideos(user, playlistName, function(dbVideos) {
      dbVideos.pop();
      return dbVideos;
    });
  };

  // Used for both like and dislike
  this.userOpinion = function(user, like) {
    if (videoDone() || Object.keys(videoState).length === 0) { return; }
    console.log('user appraises', user, like);
    if (!videoState.hasOwnProperty('opinions')) {
      videoState.opinions = new Map();
    }
    var apprMap = videoState.opinions;
    if (!apprMap.has(user)) {
      apprMap.set(user, like);
      chat.botSay(user + ' ' + (like ? 'hooted' : 'dehooted') + ' this video.');
      var channel = like ? 'num likes' : 'num dislikes';
      var value = apprMap.reduce(function(a, v, k) {
        return a + (v === like ? 1 : 0);
      }, 0);
      jub.broadcast(channel, value);

      // DJ gets karma for the video likes
      karma.giveVideoKarma(videoState.user, user, videoState.id, function(k) {
        jub.giveKarmaAndGetTotal(k, function(sum) {
          chat.broadcastKarmaReport(videoState.user, sum);
        });
      });
    }
  };

  this.giveKarmaAndGetTotal = function(k, errCb) {
    if (currentUsers.has(k.recipient)) {
      db.addKarma(k, function() {
        db.getUserKarmaTotal(k.recipient, callback);
      }, errCb);
    }
  };

  this.getKarma = function(user, callback, errCb) {
    db.getUserKarmaTotal(user, callback, errCb);
  };

  this.shuffle = function(user, playlistName) {
    console.log('shuffling for ', user, playlistName);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      jubUtil.knuthShuffle(videos);
      return videos;
    });
  };

  this.deleteTracks = function(user, playlistName, indices) {
    console.log('deleting tracks for ', user, indices);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      _.pullAt(videos, indices);
      return videos;
    });
  };

  this.sendToTop = function(user, playlistName, indices) {
    console.log('sending tracks to top for', user, indices);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      return videos
        .partition(function(v, i) { return (indices.indexOf(i) > -1); })
        .flatten();
    });
  };

  this.sendToBottom = function(user, playlistName, indices) {
    console.log('sending tracks to bottom for', user, indices);
    jub.updatePlaylistVideos(user, playlistName, function(videos) {
      return videos
        .partition(function(v, i) { return (indices.indexOf(i) === -1); })
        .flatten();
    });
  };

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
  };

  // TODO maybe this function should also broadcast
  this.startNewVideo = function(user, newVideo) {
    videoState = _.merge({},  newVideo);
    videoState.startTime = Date.now();
    videoState.user = user;
    chat.videoStarted(videoState);
    console.log("Updated video state: \"%s\"", videoState.title);
    console.log('next video is now', newVideo);
  };

  this.clearVideoState = function() {
    console.log('clearing video state');
    videoState.id = null;
    videoState.user = null;
    videoState.title = null;
  };

  this.emittableUserMap = function() {
    return currentUsers.map(function(user) {
      return {
        name: user,
        color: chat.colorFor(user)
      };
    });
  };

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
    };
  };

  this.emittableQueueFor = function(user) {
    if (videoQueues.has(user)) {
      return videoQueues.get(user).toArray();
    }
  };

  // All of user's playlists
  // TODO this calls toObject and omit nestedly - we may want to do that
  // elsewhere when fetching from the DB and sending back to the client
  // TODO this happens to be the function that's called (via rotateVideos)
  // that sets up a new user's playlists. It should probably be called
  // sooner, or, when a user tries to add a video and they don't have any
  // playlists (even sandbox) (which will never happen...), these functions
  // should be called.
  this.fetchPlaylistsFor = function(user, callback, errCb) {
    var selected = null;
    async.series([
      function(done) {
        db.fetchOrInitUserPreferences(user, function(fetched) {
          selected = fetched.selectedPlaylist;
          done();
        }, errCb);
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
        }, errCb);
      },
    ]);
  };

  this.userDjing = function(user, callback) {
    callback(!!(djSched.indexOf(user || '') > -1));
  };

  // Includes `dj` state
  this.fetchPreferencesFor = function(user, callback, errCb) {
    var emittable = {};
    db.fetchOrInitUserPreferences(user, function(fetched) {
      // Use the fetched color (or generate a random one)
      emittable.color = chat.colorFor(user, fetched.color);
      emittable.requeueVideos = fetched.requeueVideos;
      emittable.selectedPlaylist = fetched.selectedPlaylist;
      emittable.showChatImages = fetched.showChatImages;
      callback(emittable);
    }, errCb);
  };

  // Client wants to rename a playlist
  this.renamePlaylist = function(user, fromName, toName, errCb) {
    if (toName == 'sandbox') { return; }
    console.log('renaming playlist');
    async.series([
      function(done) {
        // First change the name of the playlist
        jub.updatePlaylistMeta(user, fromName, function(playlist) {
          playlist.name = toName;
        }, done, errCb);
      },
      function(done) {
        // Now create a new sandbox playlist if needed
        if (fromName == 'sandbox') {
          jub.updatePlaylistMeta(user, 'sandbox', function(playlist) {}, done, errCb);
        } else {
          done();
        }
      },
      function(done) {
        // Make sure the new playlist is selected
        jub.updateUserPreferences(user, { selectedPlaylist: toName }, done, errCb);
      }
    ]);
  };

  function newPlaylistName(user, fromName, callback, errCb) {
    db.fetchOrInitPlaylists(user, function(lists) {
      if (fromName === 'sandbox') { fromName = 'New playlist'; }
      var existing = _.map(lists, function(pl) { return pl.name; });
      var split = /^(.*?)(\s[0-9]+)?$/.exec(fromName);
      var baseName = split[1];
      var num = split[2] ? parseInt(split[2].trim()) : 1;
      while (_.includes(existing, baseName + ' ' + num)) {
        num = num + 1;
      }
      callback(baseName + ' ' + num);
    }, errCb);
  }

  this.copyPlaylist = function(user, playlistName, errCb) {
    console.log('copying playlist', user, playlistName);
    var newName = 'ERROR';
    var videosToCopy = [];
    async.series([
      function(done) {
        newName = newPlaylistName(user, playlistName, function(result) {
          newName = result;
          done();
        }, errCb);
      },
      function(done) {
        db.updatePlaylistVideos(user, playlistName, function(videos, doneUpdating) {
          videosToCopy = _.cloneDeep(videos);
          doneUpdating(videos, function(pl) { done(); });
        }, errCb);
      },
      function(done) {
        // Create the new playlist
        jub.updatePlaylistMeta(user, newName, function(playlist) {}, done, errCb);
      },
      function(done) {
        // Populate the new playlist
        jub.updatePlaylistVideos(user, newName, function(videos) {
          return _.cloneDeep(videosToCopy);
        }, done, errCb);
      },
      function(done) {
        // Make sure the new playlist is selected
        jub.updateUserPreferences(user, { selectedPlaylist: newName }, done, errCb);
      }
    ]);
  };

  this.deletePlaylist = function(user, playlistName, whisperToClient, errCb) {
    if (playlistName != 'sandbox') {
      db.deletePlaylist(user, playlistName, whisperToClient, errCb);
      jub.updateUserPreferences(user, { selectedPlaylist: 'sandbox' }, function(){}, errCb);
    }
  };

  // Add the user to the end of the rotation if it's not already in the
  // rotation.
  this.addDj = function(user) {
    var index = djSched.indexOf(user);
    if (index == -1) {
      djSched.push(user);
    }
    console.log('added DJ', user, '- now djSched', djSched);
    updateUpNext();
  };

  // Remove the user from the rotation if it's there
  this.removeDj = function(user) {
    var index = djSched.indexOf(user);
    if (index > -1) {
      djSched.splice(index, 1);
    }
    console.log('removed DJ', user, ', now djSched', djSched);
    updateUpNext();
  };

  this.addUser = function(user, socket, callback) {
    if (user) {
      currentUsers.add(user);
      if (!usersSeen.has(user)) {
        usersSeen.add(user);
        console.log('force reload', user);
        socket.emit('force reload');
      }
      // Could replace callback with broadcast
      callback(jub.emittableUserMap());
    }
  };

  this.setCurrentUsers = function(users, callback) {
    currentUsers.clear();
    currentUsers.add(chat.bot.name);
    currentUsers.addEach(users);

    // For any users in the djSched and not in the room, remove from djSched
    // after a delay
    _.chain(djSched)
     .filter(function(user) { return !currentUsers.has(user); })
     .each(function(user) {
       setTimeout(function() {
         if (!currentUsers.has(user) && _.includes(djSched, user)) {
           console.log("removing aromatt from dj queue", djSched);
           _.pull(djSched, user);
           console.log("now djSched", djSched);
           updateUpNext();
         }
       }, KICK_DJ_TIMEOUT);
     })
     .value();
    callback(jub.emittableUserMap());
  };

  // User loads page, and proposes a username for itself based on cookies.
  // Send back initial data (pre-DB), including (and currently limited to)
  // their actual username (likely the same as their proposed one).
  // Also send them the day's cached chat.
  this.userLoaded = function(user, callback) {
    console.log('user loaded', user);

    // Generate a random username if none is provided
    if (!user) {
      user = chat.genUsername();
    }

    // Don't need to force reload this user
    usersSeen.add(user);

    var emittable = { name: user };
    callback(emittable);
  };

  this.getChatCache = function(callback) {
    // Send the day's chat history to the user
    chat.loadChatCache(config.chat_cache_limit, function(msgObjs) {
      msgObjs.forEach(function(msgObj) {
        callback(msgObj);
      });
    });
  };

  this.videoSearch = function(query, callback) {
    gapi.videoSearch(query, callback);
  };
}

module.exports = function(config, gapi, chat, db) {
  var jub = new JubDJ(config, gapi, chat, db);
  if (process.env.TEST) { jub.addDj(chat.bot.name); }
  return jub;
};
