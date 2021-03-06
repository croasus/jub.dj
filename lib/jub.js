let jubUtil = require('./jub_util');
let util = require('util');
let _ = require('lodash');
let Set = require("collections/set");
let Map = require("collections/map");
let Deque = require("collections/deque");
let moment = require("moment");
let async = require("async");
let karma = require('./karma');
let lock = require('./locked_function');
require('./logging')(); // TODO accept logger as an argument
jubUtil.monkeyPatch();
let getIn = jubUtil.getIn;
let ifLet = jubUtil.ifLet;

// TODO collections module has incomplete documentation
// -> Replace these data structures with vanilla equivalents and leverage
//    lodash to get the functional goodies that collections was providing.
function JubDJ(config, gapi, chat, db, auth, mail) {

  // rotateVideos is called periodically, and protected by a mutex with a timeout
  let ROTATE_VIDEOS_INTERVAL = 500;
  let ROTATE_VIDEOS_LOCK_TIMEOUT = 10 * 1000;

  // Number of room-queued videos to show
  let UP_NEXT_LEN = 10;

  // After DJ leaves room before removing from rotation
  let KICK_DJ_TIMEOUT = 10 * 1000;

  let jub = this;
  let videoState = {};
  let djSched = [];             // circular buffer of users signed up to DJ
  let currentUsers = {};
  let upNext = [];              // keeps track of upcoming videos
  let karmaMap = {};
  let queueMap = {};
  let muteMap = {};

  this.secret = null;

  // These will be updated by the socketeer
  this.broadcast = () => {};
  this.whisper = () => {};
  this.stopFns = [db.stop];             // List of functions to call when shutting down

  chat.jub = jub;

  // Map of current DJs to their respective queues
  let updateQueueMap = function(callback, errCb) {
    let start = Date.now();
    async.reduce(djSched, {}, (memo, user, next) => {
      jub.fetchPlaylistsFor(user, (lists, selected) => {
        memo[user] = (_.find(lists, _.matchesProperty('name', selected)) || {}).videos;
        next(null, memo);
      }, errCb);
    }, (err, result) => {
      if (err) { return errCb(err); }
      queueMap = result;
      callback(queueMap);
    });
  };

  // Map of current DJs to their respective queue lengths
  let queueLenMap = function() {
    return _.reduce(queueMap, (result, queue, user) => {
      result[user] = queue.length;
      return result;
    }, {});
  };

  // Rotate DJs until someone who has videos to play is first. Returns next
  // dj if there was a valid one, otherwise null
  let rotateDjs = function(callback, errCb) {
    let queueLens = queueLenMap();
    let sumQueued = _.reduce(queueLens,
                             (memo, len, dj) => { return memo + len; },
                             0);
    let next = null;
    if (sumQueued > 0) {
      // The current DJ occupies the first slot in the queue unless they
      // have left the queue. If they have left, rotation may be unnecessary.
      if (videoState.user === djSched[0]) {
        djSched.push(djSched.shift());
      }
      while (queueLens[djSched[0]] === 0) {
        djSched.push(djSched.shift());
      }
      next = djSched[0];
    }
    return next;
  };

  let videoDone = function() {
    let endTime = (videoState.clipEndTime < videoState.duration ?
        videoState.clipEndTime - videoState.clipStartTime + videoState.startTime :
        videoState.duration + videoState.startTime);
    return Date.now() > endTime;
  };

  let broadcastVideoState = function() {
    if (videoState) {
      jub.broadcast('video state', jub.emittableVideoState());
    }
  };

  // Pop -> unshift for the user's selected playlist.
  // Calls callback with a copy of the popped video
  let rotateSelectedPlaylist = function(user, callback, errCb) {
    let nextVideo = {};
    let userPrefs = {};
    jub.fetchPlaylistsFor(user, (lists, selected) => {
      async.series([
        done => {
          db.fetchUserPreferences(user, prefs => {
            userPrefs = prefs;
            done();
          }, errCb);
        },
        done => {
          jub.updatePlaylistVideos(user, selected, videos => {
            nextVideo = videos.shift();
            if (nextVideo && !(selected == 'sandbox' &&
                               userPrefs.requeueVideos === false)) {
              videos.push(nextVideo);
            }
            return videos;
          }, done, errCb);
        },
        done => {
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
  let rotateVideos = lock.passThrough(function(release) {
    // Return unless time to rotate videos or no video has ever been played
    if (!(videoDone() || Object.keys(videoState).length === 0)) { return release(); }

    // Find the next DJ with something to play
    nextDj = rotateDjs();

    // If someone actually has something to play, send the new DJ their
    // updated queue and broadcast the new video state.
    if (nextDj) {
      rotateSelectedPlaylist(nextDj, nextVideo => {
        if (nextVideo) {
          jub.startNewVideo(nextDj, nextVideo);
        }
        updateQueueCaches();
        broadcastVideoState();
        release();
      }, release);
    } else {
      // No one has anything to play, but someone may have just clicked
      // 'skip', so send back the updated state anyway.
      if (videoState && Object.keys(videoState).length > 0) {
        if (videoState.id !== null) {
          jub.clearVideoState();
          updateQueueCaches();
          broadcastVideoState();
        }
      }
      release();
    }
  }, { timeout: ROTATE_VIDEOS_LOCK_TIMEOUT });
  let rotateVideosInterval = setInterval(rotateVideos, ROTATE_VIDEOS_INTERVAL);

  this.reloadUser = function(user) {
    console.log('reloading user', user);
    jub.whisper(user, 'force reload');
  };

  this.stop = function() {
    console.log('jub stopping');
    clearInterval(rotateVideosInterval);
    _.each(jub.stopFns, fn => { fn(); });
  };

  // Calls back with a list of the next `len` videos, assuming the current
  // DJ schedule
  let computeUpNext = lock.queued(function(release, len, callback, errCb) {
    let qs = queueMap;
    for (var user in qs) {
      // queueMap does not sort for us
      qs[user] = _.sortBy(qs[user], x => { return x.position; });
    }
    let list = [];
    let djs = _.cloneDeep(djSched);

    // djSched might have changed since queueMap started
    qs = _.pick(qs, djs);

    let numVideos = _.reduce(qs, (a,v,k) => { return a + v.length; }, 0);
    if (numVideos > 0) {
      // Don't start with the current DJ.
      // But before skipping them, make sure they are actually at the head
      // of the queue.
      if (videoState.user === djs[0]) {
        djs.push(djs.shift());
      }
      while (list.length < len) {
        let nextDj = djs[0];
        let nextVideo = qs[nextDj][0];
        if (nextVideo) {
          nextVideo.user = nextDj;
          nextVideo.userColor = chat.colorFor(nextDj);
          list.push(nextVideo);
          qs[nextDj].push(qs[nextDj].shift());
        }
        djs.push(djs.shift());
      }
    }
    callback(list);
    release();
  }, { timeout: 10000 });

  // This should be called whenever someone makes a change to one of their
  // playlists
  let updateQueueCaches = function() {
    console.log("updateQueueCaches");
    updateQueueMap(qs => {
      console.log("queueMap updated");
      computeUpNext(UP_NEXT_LEN, function(list) {
        upNext = list;
        console.log("upnext updated");
        jub.broadcast('up next', list);
      }, function(err) {
        console.error("computeUpNext failed", err);
      });
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
      done => {
        db.updatePlaylistVideos(user, playlistName, (videos, doneUpdating) => {
          let updated = updateFn(videos);
          doneUpdating(updated, pl => { done(); });
        }, errCb);
      },
      // Whisper the updated playlist back to the user
      done => {
        jub.fetchPlaylistsFor(user, (lists, selected) => {
          jub.whisper(user, 'playlists', lists, selected);
          done();
        }, errCb);
      },
      done => {
        if (typeof finale == 'function') { finale(); }
        done();
      },
      done => {
        // Recompute 'up next' list
        updateQueueCaches();
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
      done => {
        db.updatePlaylistMeta(user, playlistName, (playlist, doneUpdating) => {
          updateFn(playlist);
          doneUpdating(playlist, pl => {
            done();
          });
        }, errCb);
      },
      // Whisper the updated playlist back to the user
      done => {
        jub.fetchPlaylistsFor(user, (lists, selected) => {
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
    db.updateUserPreferences(user, updates, updated => {
      jub.whisper(user, 'preferences', updated);
      if (_.has(updates, 'selectedPlaylist')) {
        updateQueueCaches();
      }
      if (typeof done === 'function') { done(); }
    }, errCb);
  };

  // Enqueue a single video for a user
  this.enqueueVideo = function(user, playlistName, video) {
    console.log('enqueue video', user, playlistName, video);
    if (!(video.title && video.duration)) {
      return console.error('cannot enqueue video without title/duration', video);
    }
    jub.updatePlaylistVideos(user, playlistName, videos => {
      videos.push(video);
      return videos;
    });
  };

  // Add an array of videos to a jub playlist
  this.enqueueVideos = function(user, playlistName, videos) {
    console.log('enqueue videos:', user, playlistName, util.inspect(videos));
    jub.updatePlaylistVideos(user, playlistName, dbVideos => {
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
    jub.updatePlaylistVideos(user, playlistName, dbVideos => {
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
    let apprMap = videoState.opinions;
    if (!apprMap.has(user)) {
      apprMap.set(user, like);

      let chatMsg = user + ' ' + (like ? 'hooted' : 'dehooted') + ' this video.';

      let channel = like ? 'num likes' : 'num dislikes';
      let value = apprMap.reduce((a, v, k) => {
        return a + (v === like ? 1 : 0);
      }, 0);
      jub.broadcast(channel, value);

      // DJ gets karma for the video likes. Only users with accounts can give karma
      // though.
      if (jub.isUserAccount(user)) {
        karma.giveVideoKarma(videoState.user, user, videoState.id, k => {
          let karmaMeta = {};
          chat.updateMsgKarma(karmaMeta, k);
          chat.botSayWithMeta(chatMsg, karmaMeta);

          jub.giveKarmaAndGetTotal(k, sum => {
            chat.broadcastKarmaFor(videoState.user, sum);
          });
        });
      } else {
        chat.botSay(chatMsg);
      }
    }
  };

  this.setLocalKarmaMapAndRefreshUsers = function(map) {
    jub.setLocalKarmaMap(map);
    jub.refreshUsersForClients();
  }

  this.setLocalKarmaMap = function(map) {
    jub.karmaMap = map;
  }

  this.refreshUsersForClients = function() {
    jub.broadcast('users info', jub.emittableUserInfo());
  }

  this.isUserAccount = function(user) {
    return getIn(currentUsers, [user, 'kind']) == 'account';
  }
  // Can only give karma if the giver and receiver have accounts and are both
  // present
  this.giveKarmaAndGetTotal = function(k, callback, errCb) {
    if (!jub.isUserAccount(k.giver)) { return; }
    if (!jub.isUserAccount(k.recipient)) { return; }
    db.addKarma(k, () => {
      db.getUserKarmaTotal(k.recipient, callback, errCb);
      db.getKarmaReceived(jub.setLocalKarmaMapAndRefreshUsers);
    }, errCb);
  };

  this.karmaFor = function(user) {
    if (!_.has(jub.karmaMap, user)) { return 0; }
    return _(jub.karmaMap[user]).values().sum();
  }

  this.muteFor = function(user) {
    return jub.muteMap[user];
  }

  this.updateMute = function (user, isMuted, callback) {
    jub.muteMap[user] = isMuted;
    callback(jub.emittableUserInfo());
  }

  this.getKarma = function(user, callback, errCb) {
    db.getUserKarmaTotal(user, callback, errCb);
  };

  this.shuffle = function(user, playlistName) {
    console.log('shuffling for ', user, playlistName);
    jub.updatePlaylistVideos(user, playlistName, videos => {
      jubUtil.knuthShuffle(videos);
      return videos;
    });
  };

  this.deleteTracks = function(user, playlistName, indices) {
    console.log('deleting tracks for ', user, indices);
    jub.updatePlaylistVideos(user, playlistName, videos => {
      _.pullAt(videos, indices);
      return videos;
    });
  };

  this.sendToTop = function(user, playlistName, indices) {
    console.log('sending tracks to top for', user, indices);
    jub.updatePlaylistVideos(user, playlistName, videos => {
      return videos
        .partition((v, i) => { return (indices.indexOf(i) > -1); })
        .flatten();
    });
  };

  this.sendToBottom = function(user, playlistName, indices) {
    console.log('sending tracks to bottom for', user, indices);
    jub.updatePlaylistVideos(user, playlistName, videos => {
      return videos
        .partition((v, i) => { return (indices.indexOf(i) === -1); })
        .flatten();
    });
  };

  this.clipTrack = function(user, playlist, selectedIndex, startTime, endTime) {
    console.log('clipping tracks for user ' + user + ', playlist ' + playlist
                + ', start time ' + startTime + ', end time ' + endTime, selectedIndex);
    jub.updatePlaylistVideos(user, playlist, videos => {
      videos[selectedIndex].clipStartTime = startTime * 1000;
      videos[selectedIndex].clipEndTime = endTime * 1000;
      return videos;
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
  };

  // TODO maybe this function should also broadcast
  this.startNewVideo = function(user, newVideo) {
    videoState = _.merge({},  newVideo);
    videoState.startTime = Date.now();
    videoState.user = user;
    videoState.clipStartTime = newVideo.clipStartTime;
    videoState.clipEndTime = newVideo.clipEndTime;
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

  this.emittableUserInfo = function() {
    return _.map(currentUsers, (obj, name) => {
      return {
        name: name,
        kind: obj.kind,
        color: chat.colorFor(name),
        karma: jub.karmaFor(name),
        isMuted: jub.muteFor(name)
      };
    });
  };

  this.emittableVideoState = function() {
    if (videoState.id) {
      return {
        id: videoState.id,
        title: videoState.title,
        startTime: videoState.startTime,
        serverTime: Date.now(),
        clipStartTime: videoState.clipStartTime,
        clipEndTime: videoState.clipEndTime,
        duration: videoState.duration,
        user: videoState.user,
        userColor: chat.colorFor(videoState.user),
        opinions: videoState.opinions
      };
    } else {
      return {};
    }
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
    let selected = null;
    async.series([
      done => {
        db.fetchUserPreferences(user, fetched => {
          selected = fetched.selectedPlaylist;
          done();
        }, errCb);
      },
      done => {
        db.fetchPlaylists(user, fetched => {
          let emittable = _.map(fetched.toObject(), pl => {
            let adj = _.omit(pl.toObject(), ['_id', '__v']);
            adj.videos = _.map(pl.videos.toObject(), v => {
              return _.omit(v, ['_id', '__v']);
            });
            return adj;
          });
          console.log('fetched playlists for', user);
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
    let emittable = {};
    db.fetchUserPreferences(user, fetched => {
      // Use the fetched color (or generate a random one)
      emittable.color = chat.colorFor(user, fetched.color);
      emittable.requeueVideos = fetched.requeueVideos;
      emittable.selectedPlaylist = fetched.selectedPlaylist;
      emittable.showChatImages = fetched.showChatImages;
      emittable.addSpaceAfterMention = fetched.addSpaceAfterMention;
      emittable.allowMuteStatus = fetched.allowMuteStatus;
      emittable.showChatAnimations = fetched.showChatAnimations;
      callback(emittable);
    }, errCb);
  };

  // Client wants to rename a playlist
  this.renamePlaylist = function(user, fromName, toName, errCb) {
    if (toName == 'sandbox') { return; }
    console.log('renaming playlist');
    async.series([
      done => {
        // First change the name of the playlist
        jub.updatePlaylistMeta(user, fromName, playlist => {
          playlist.name = toName;
        }, done, errCb);
      },
      done => {
        // Now create a new sandbox playlist if needed
        if (fromName === 'sandbox') {
          db.createPlaylist(user, 'sandbox', done, errCb);
        } else {
          done();
        }
      },
      done => {
        // Make sure the new playlist is selected
        jub.updateUserPreferences(user, { selectedPlaylist: toName }, done, errCb);
      }
    ]);
  };

  function newPlaylistName(user, fromName, callback, errCb) {
    db.fetchPlaylists(user, lists => {
      if (fromName === 'sandbox') { fromName = 'New playlist'; }
      let existing = _.map(lists, pl => { return pl.name; });
      let [, baseName, numstr] = /^(.*?)(\s[0-9]+)?$/.exec(fromName);
      let num = numstr ? parseInt(numstr.trim()) : 1;
      while (_.includes(existing, baseName + ' ' + num)) {
        num = num + 1;
      }
      callback(baseName + ' ' + num);
    }, errCb);
  }

  this.copyPlaylist = function(user, playlistName, errCb) {
    console.log('copying playlist', user, playlistName);
    let newName = 'ERROR';
    let videosToCopy = [];
    async.series([
      done => {
        newName = newPlaylistName(user, playlistName, result => {
          newName = result;
          done();
        }, errCb);
      },
      done => {
        db.updatePlaylistVideos(user, playlistName, (videos, doneUpdating) => {
          videosToCopy = _.cloneDeep(videos);
          doneUpdating(videos, pl => { done(); });
        }, errCb);
      },
      done => {
        // Create the new playlist
        db.createPlaylist(user, newName, done, errCb);
      },
      done => {
        // Populate the new playlist
        jub.updatePlaylistVideos(user, newName, videos => {
          return _.cloneDeep(videosToCopy);
        }, done, errCb);
      },
      done => {
        // Make sure the new playlist is selected
        jub.updateUserPreferences(user, { selectedPlaylist: newName }, done, errCb);
      }
    ]);
  };

  this.deletePlaylist = function(user, playlistName, whisperToClient, errCb) {
    if (playlistName != 'sandbox') {
      db.deletePlaylist(user, playlistName, whisperToClient, errCb);
      jub.updateUserPreferences(user, { selectedPlaylist: 'sandbox' }, () => {}, errCb);
    }
  };

  // Add the user to the end of the rotation if it's not already in the
  // rotation. No guests allowed
  this.addDj = function(user) {
    let index = djSched.indexOf(user);
    if (index == -1) {
      djSched.push(user);
      console.log('added DJ', user, '- now djSched', djSched);
      updateQueueCaches();
    }
  };

  // Remove the user from the rotation if it's there
  this.removeDj = function(user) {
    let index = djSched.indexOf(user);
    if (index > -1) {
      djSched.splice(index, 1);
      console.log('removed DJ', user, ', now djSched', djSched);
      updateQueueCaches();
    }
  };

  function broadcastPresenceUpdates(old, cur) {
    let joined = _.difference(_.keys(cur), _.keys(old));
    let left = _.difference(_.keys(old), _.keys(cur));

    joined.forEach(user => {
      chat.botSay(user + ' has joined the pub.');
    })

    left.forEach(user => {
      chat.botSay(user + ' has left the pub.');
    })
  }

  function kickAbsentDJs(callback) {
    // For any users in the djSched and not in the room, remove from djSched
    // after a delay
    _.chain(djSched)
     .filter(user => { return !_.has(currentUsers, user); })
     .each(user => {
       setTimeout(() => {
         if (!_.has(currentUsers, user) && _.includes(djSched, user)) {
           console.log("removing", user, "from dj queue", djSched);
           _.pull(djSched, user);
           console.log("now djSched", djSched);
           updateQueueCaches();
         }
       }, KICK_DJ_TIMEOUT);
     })
     .value();
  }

  this.setCurrentUsers = function(users, callback) {
    let oldCurrentUsers = _.cloneDeep(currentUsers);

    Object.keys(currentUsers).forEach(k => { delete currentUsers[k]; });
    currentUsers[chat.bot.name] = { kind: 'account' };

    async.reduce(users, currentUsers, (memo, user, next) => {

      db.accountExists(user, (exists) => {
        memo[user] = { kind: (exists ? 'account' : 'guest') };
        next(null, memo);
      }, err => { return console.error(err); });

    }, (err, result) => {
      if (err) { return console.error(err); }

      broadcastPresenceUpdates(oldCurrentUsers, currentUsers);
      kickAbsentDJs();
      callback(jub.emittableUserInfo());
    });
  };

  // calls callback with a token or null
  this.login = function(username, password, expiration, callback) {
    db.validateLogin(username, password, isValid => {
      if (!isValid) { return callback(null); }
      db.getFormattedName(username, (formattedName, errMsg) => {
        if (!formattedName) { return callback(null); }
        let data = 'account,' + formattedName; // TODO use JWT
        auth.createSessionToken(expiration, data, jub.secret, token => {
          callback(token, formattedName);
        });
      });
    });
  };

  // calls callback with a token if successful, or a null token and an errorMsg
  this.joinAsGuest = function(nickname, expiration, callback) {
    // Check if any guest or user has the name
    if (_.has(currentUsers, nickname)) {
      return callback(null, "That name is already taken :-(");
    }

    let errorMsg = db.validateNickname(nickname)
    if (errorMsg !== null && errorMsg.length > 0) {
      return callback(null, errorMsg);
    }

    // Check if any absent user has the name
    db.accountExists(nickname, taken => {
      if (taken) {
        return callback(null, "That name is already taken :-(");
      }
      // Everything is good to go
      let data = 'guest,' + nickname;
      auth.createSessionToken(expiration, data, jub.secret, token => {
        callback(token, '');
      });
    });
  };

  // calls back with an errorMsg (or '' if successful)
  this.validateSessionToken = function(candidate, callback) {
    auth.validateSessionToken(candidate, jub.secret, callback)
  };

  // calls back with error message or null
  this.signup = function(username, password, email, callback) {
    db.createAccount(username, password, email, errMsg => {
      if (errMsg) { return callback(errMsg); }
      db.initPlaylists(username, () => {
        callback(null);
      }, error => { // This is the error callback
        console.error("initPlaylists failed", error);
        callback("An unknown error occurred.");
      });
    });
  };

  this.generateResetPasswordLink = function(username, token) {
    let port = parseInt(process.env.JUB_PORT || '3000', 10);
    let host = process.env.TEST ? 'localhost:' + port : 'thejub.pub';
    let url = 'http://' + host + '/reset-password?' +
              'username=' + username + '&token=' + token;
    return '<a href="' + url + '">' + url + '</a>';
  };

  // calls back with (success, message)
  this.validatePasswordResetToken = function(username, token, callback) {
    db.validatePasswordResetToken(username, token, callback);
  };

  // Accept a new plaintext password. validate the reset token and update
  // the passwordHash in the db
  this.resetPassword = function(username, token, password, callback) {
    db.spendPasswordResetToken(username, token,
                                  (success, message) => {
      if (success) {
        // TODO this method mixes paradigms for error handling...
        // i.e. errCb vs. (success, message)
        db.updatePassword(username, password,
                          callback,
                          err => { // errCb
          console.error(err);
          return callback(false, 'Unknown error.');
        });
      } else {
        return callback(false, message);
      }
    });
  };

  this.requestPasswordReset = function(username, callback) {
    db.requestPasswordReset(username, (token, errMsg) => {
      if (!token) {
        return callback(false, errMsg || "Unknown error.");
      }
      db.getEmailAddress(username, (emailAddress, errMsg) => {
        if (errMsg) {
          return callback(null, errMsg);
        }
        db.getFormattedName(username, (formattedName, errMsg) => {
          if (errMsg) {
            return callback(null, errMsg);
          }
          let recipient = emailAddress;
          let subject = "Reset your password";
          let resetLink = jub.generateResetPasswordLink(formattedName, token);
          let errorSubject = "Issue%20Report:%20Unauthorized%20Password%20Reset";
          let message = "<b>Click this link to reset your password:</b> " +
                        resetLink + ".<br><br>" +
                        "This link will expire in one day.  " +
                        "If you did not initiate a password reset, ignore the " +
                        "link above and please report this incident to " +
                        '<a href="mailto:contact@thejub.pub?subject=' +
                        errorSubject + '">contact@thejub.pub</a>.';
          mail.send(recipient, subject, message, true);
          callback(true, "An email with a reset link has been sent to the " +
                         "owner of the account.");
        });
      });
    });
  };

  this.getChatCache = function(callback) {
    // Send the day's chat history to the user
    chat.loadChatCache(config.chat_cache_limit, msgObjs => {
      msgObjs.forEach(msgObj => {
        callback(msgObj);
      });
    });
  };

  this.videoSearch = function(query, callback) {
    gapi.videoSearch(query, callback);
  };
}

module.exports = function(config, gapi, chat, db, auth, mail) {
  let jub = new JubDJ(config, gapi, chat, db, auth, mail);
  //if (process.env.TEST) { jub.addDj(chat.bot.name); }

  // Initialize some more things
  db.getKarmaReceived(jub.setLocalKarmaMapAndRefreshUsers);
  jub.muteMap = {};

  auth.genHMACSecret(secret => {
    jub.secret = secret;
  });

  if (process.env.TEST) {
    let user = config.test.user;
    jub.signup(user.name, user.password, user.email, err => {
      console.log("created test user");
    });
  }

  return jub;
};
