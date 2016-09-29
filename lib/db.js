var util = require('util');
var mongoose = require('mongoose');
var async = require('async');
var _ = require('lodash');
require('./logging')();

function noCaseRegExp(word) {
  return new RegExp('^' + word + '$', 'i');
}

function DB(config, models, auth) {

  var RESET_PASSWORD_EXPIRATION = 3600 * 24 * 1000;

  mongoose.connect(config.mongodb_endpoint + '/' + config.mongodb_db, function(err) {
    if (err) console.error(err);
  });
  var conn = mongoose.connection;
  var db = this;
  this.ready = false;

  conn.on('error', console.error.bind(console, 'connection error:'));
  conn.once('open', function (callback) {
    console.log("successful connection to db %s", config.mongodb_db);
    db.ready = true;
  });

  function defaultErrCb(err) {
    return console.error("Error caught in Mongoose callback:", err);
  }

  // This is handy because mongoose will silence any errors that occur in
  // callbacks passed to its functions.
  function wrapTry(context, errCb, fn) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    return function() {
      try {
        return fn.apply(context, arguments);
      } catch(err) {
        errCb(err);
      }
    }
  }

  this.deletePlaylist = function(user, playlistName, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.Playlist.remove({ user: user, name: playlistName}, function(err) {
      if (err) return errCb(err);
      callback();
    });
  };

  // calls back with (isValid, formattedUsername)
  this.validateLogin = function(username, password, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.UserPreferences.findOne({ name: noCaseRegExp(username) },
                                   wrapTry(this, errCb, function(err, fetched) {
      if (err) { errCb(err); }
      if (fetched) {
        auth.checkPassword(password, fetched.passwordHash, function(err, res) {
          callback(res, fetched.name);
        });
      } else {
        callback(false, ''); // No user with name `username`
      }
    }));
  };

  // Returns errMsg or null if valid
  this.validateName = function(name, type) {
    type = type || 'Username';
    if (name.length === 0) {
      return type + ' cannot be blank.';
    }
    if (name.search(/^[a-zA-Z0-9-_]+$/) < 0) {
      return type + ' can only contain letters, numbers, hyphens and underscores.';
    }
    return null;
  }

  this.validatePassword = function(password) {
    if (password.length < 6) {
      if (password.length === 0) {
        return 'Password cannot be blank.';
      } else {
        return 'Password must be at least 6 characters long.';
      }
    }
    return null;
  }

  this.validateEmailAddress = function(email) {
    if (email.length === 0 || !email.includes('@')) {
      return 'Invalid email address.';
    }
    return null;
  }

  // return null if valid, otherwise error message
  function validateNewAccount(username, password, email) {
    var nameError = db.validateName(username, 'Username');
    if (nameError) { return nameError; }
    var passwordError = db.validatePassword(password);
    if (passwordError) { return passwordError; }
    var emailError = db.validateEmailAddress(email);
    if (emailError) { return emailError; }
    return null;
  }

  this.validateNickname = function(nickname) {
    var nameError = db.validateName(nickname, 'Nickname');
    console.log("nameERror", nameError);
    if (nameError !== null) { return nameError; }
    console.log("validatenickname returning null");
    return null;
  }

  this.accountExists = function(username, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (db.validateName(username) !== null) {
      return callback(false);
    }
    models.UserPreferences.findOne({ name: noCaseRegExp(username) },
                                   wrapTry(this, errCb, function(err, obj) {
      if (err) { errCb(err); return callback(false); }
      callback(!!obj);
    }));
  };

  // Calls callback with a string errorMsg if unsuccessful; errorMsg is '' if
  // successful.
  this.createAccount = function(username, password, email, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    console.log('trying to create account for user', username);
    var errorMsg = validateNewAccount(username, password, email);
    if (errorMsg) {
      return callback(errorMsg);
    }
    auth.hashPassword(password, function(passwordHash) {
      db.accountExists(username, function(taken) {
        if (taken) {
          return callback('That username is taken.');
        } else {
          models.UserPreferences.findOne({ name: noCaseRegExp(username) },
                                         wrapTry(this, errCb, function(err, obj) {
            if (err) { errCb(err); return callback('Unknown error.'); }
            console.log('creating new user', username);
            obj = models.UserPreferences({
              name: noCaseRegExp(username),
              passwordHash: passwordHash,
              emailAddress: email,
              createdAt: new Date()
            });
            obj.save(function(err, obj, numAffected) {
              if (err) {
                errCb(err);
                return callback('Unknown error.');
              } else {
                return callback(null);
              }
            });
          }));
        }
      });
    }, function(err) { // from hashPassword
      console.error(err);
      callback('Unknown error.');
    });
  };

  this.getFormattedName = function(username, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.UserPreferences.findOne({ name: noCaseRegExp(username) },
                                   wrapTry(this, errCb, function(err, obj) {
      if (err) { return errCb(err); }
      if (!obj) {
        errCb(err);
        callback(null, 'Username not found');
      } else {
        callback(obj.name, null);
      }
    }));
  };

  this.getEmailAddress = function(username, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.UserPreferences.findOne({ name: noCaseRegExp(username) },
                                   wrapTry(this, errCb, function(err, obj) {
      if (err) { return errCb(err); }
      if (!obj) {
        return errCb(err);
      } else {
        callback(obj.emailAddress);
      }
    }));
  }

  // Calls callback with (token, errMsg)
  // TODO mixes error handling paradigms
  this.requestPasswordReset = function(username, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    console.log('trying to initiate password reset for user', username);
    models.UserPreferences.findOne({ name: noCaseRegExp(username) },
                                   wrapTry(this, errCb, function(err, obj) {
      if (err) { errCb(err); return callback(null, 'Unknown error.'); }
      if (!obj) {
        return callback(null, 'No account with that username exists.');
      } else {
        models.ResetPassword.findOne({ user: noCaseRegExp(username) },
                                   wrapTry(this, errCb, function(err, resetState) {
          var now = new Date();
          var earliestAllowed = now;
          if (resetState) {
            earliestAllowed = new Date(resetState.grantedAt.getTime() + 60000);
            // Make sure this request didn't come too soon after the last one
            if (earliestAllowed > now) {
              return callback(null,
                'You may not reset your password more than once a minute.');
            }
          }

          // Grant the request
          auth.genPasswordResetToken(function(token) {
            if (!resetState) {
              resetState = models.ResetPassword({
                user: noCaseRegExp(username),
              });
            }
            resetState.token = token;
            resetState.grantedAt = now;
            resetState.tokenSpent = false;
            resetState.save(function(err, obj, numAffected) {
              if (err) {
                errCb(err);
                return callback(null, 'Unknown error.');
              } else {
                return callback(token, null);
              }
            });
          });
        }));
      }
    }));
  };

  // call with a token fetched from the DB. calls back with (success, msg)
  function validatePasswordResetToken(token, fetched, callback) {
    if (!fetched) {
      return callback(false, 'No reset token for that user was found.');
    }
    if (fetched.token !== token) {
      return callback(false, 'Incorrect reset token.');
    }
    if (fetched.tokenSpent) {
      return callback(false, 'That reset link has already been used.');
    }
    var now = new Date();
    var expireTime = new Date(fetched.grantedAt.getTime() + RESET_PASSWORD_EXPIRATION);
    if (now > expireTime) {
      return callback(false, 'This link is expired. Please try again.');
    }
    return callback(true, null);
  }

  this.validatePasswordResetToken = function(username, token, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    console.log('validating reset token', username, token);
    models.ResetPassword.findOne({ user: noCaseRegExp(username) },
                                 wrapTry(this, errCb, function(err, obj) {
      if (err) { errCb(err); return callback(null, 'Unknown error.'); }
      validatePasswordResetToken(token, obj, function(success, message) {
        callback(success, message);
      });
    }));
  };


  this.spendPasswordResetToken = function(username, token, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    console.log('spending reset token', username);
    models.ResetPassword.findOne({ user: noCaseRegExp(username) },
                                 wrapTry(this, errCb, function(err, obj) {
      if (err) { errCb(err); return callback(null, 'Unknown error.'); }
      validatePasswordResetToken(token, obj, function(valid, message) {
        if (!valid) {
          return callback(false, message);
        }
        obj.tokenSpent = true;
        obj.save(function(err, obj, numAffected) {
          if (err) {
            errCb(err);
            return callback(false, 'Unknown error.');
          }
          return callback(true, null);
        });
      });
    }));
  };

  // - Provide a callback that accepts an array of videos and a function.
  // - Modify the array if you wish and then call the function. When you call
  //   that function, you may pass it yet another function which will be
  //   called after the model has been successfully saved.
  this.updatePlaylistVideos = function(user, playlistName, updateFn, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (!user || !playlistName) {
      return errCb({ message: "updatePlaylistVideos: user and playlistName must be present" });
    }
    models.Playlist.findOne({ user: user, name: playlistName },
                            wrapTry(this, errCb, function(err, fetched) {
      console.log('updating playlist videos', playlistName, 'for', user);
      if (err) return errCb(err);
      if (!fetched) return console.log('no playlist', user, playlistName);

      if (typeof updateFn == 'function') {
        // Present the updateFn with a sorted copy without 'position'. We will add
        // 'position' back after the updateFn is finished
        var processed = _.chain(fetched.videos)
          .sortBy(function(x) { return x.position; })
          .map(function(x) { return _.omit(x.toObject(), ['position', '_id']); })
          .value();

        // User modifies the videos and calls callback
        updateFn(processed, function(post, finale) {
          // Rebuild the video list using the videos + order returned
          fetched.videos = [];
          _.each(post, function(x, i) {
            x['position'] = i;
            fetched.videos.unshift(models.PlaylistVideo(x));
          });

          fetched.lastModifiedAt = new Date();
          fetched.save(function(err, obj, numAffected) {
            if (err) return errCb(err);
            finale();
          });
        });
      } else { // No updateFn
        fetched.lastModifiedAt = new Date();
        fetched.save();
      }
    }));
  }

  // TODO duplicated some with updatePlaylistVideos
  this.updatePlaylistMeta = function(user, playlistName, updateFn, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (!user || !playlistName) {
      return errCb({ message: "updatePlaylistMeta: user and playlistName must be present" });
    }
    if (typeof updateFn !== 'function') {
      return errCb({ message: "updatePlaylistMeta: no update function?" });
    }
    models.Playlist.findOne({ user: user, name: playlistName },
                            wrapTry(this, errCb, function(err, fetched) {
      console.log('updating playlist', playlistName, 'for', user);
      if (err) return errCb(err);
      // User modifies the playlist before we save it
      updateFn(fetched, function(post, finale) {
        fetched.lastModifiedAt = new Date();
        fetched.save(function(err, obj, numAffected) {
          if (err) return errCb(err);
          finale();
        });
      });
    }));
  }

  // callback is called with no args if successful.
  // on error, errCb is called with an error.
  this.createPlaylist = function(user, playlistName, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (!user || !playlistName) {
      return errCb({ message: "createPlaylist failed (insufficient args)" });
    }
    console.log('CREATING new playlist for', user, playlistName);
    var playlist = models.Playlist({
        user: user,
        name: playlistName,
        createdAt: new Date(),
        videos: []
    });
    playlist.lastModifiedAt = new Date();
    playlist.save(function(err, obj, numAffected) {
      if (err) return errCb(err);
      if (typeof callback === 'function') callback();
    });
  };

  this.initPlaylists = function(user, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (!user) {
      return errCb({ message: "initPlaylists: user must be present" });
    }
    db.createPlaylist(user, 'sandbox', callback, errCb);
  }

  // Fetch all playlists for user
  this.fetchPlaylists = function(user, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (!user) {
      return errCb({ message: "fetchPlaylists: user must be present" });
    }
    models.Playlist.find({ user: user },
                         wrapTry(this, errCb, function(err, fetched) {
      if (err) { return errCb(err); }
      callback(fetched);
    }));
  }

  // calls back with (success, message)
  // TODO this mixes error/callback paradigms. It's dumb
  this.updatePassword = function(user, password, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.UserPreferences.findOne({ name: noCaseRegExp(user) },
                                   wrapTry(this, errCb, function(err, obj) {
      if (err) { errCb(err); return callback(false, 'Unknown error.'); };
      if (!obj) { return callback(false, 'No user account for ' + user); }

      var passwordError = db.validatePassword(password);
      if (passwordError) { return callback(false, passwordError); }

      auth.hashPassword(password, function(passwordHash) {
        obj.passwordHash = passwordHash;
        obj.save(function(err, obj, numAffected) {
          if (err) { return errCb(err); }
          callback(true, "Your password has been reset.");
        });
      });
    }));
  };

  this.updateUserPreferences = function(user, newPrefs, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.UserPreferences.findOne({ name: noCaseRegExp(user) },
                                   wrapTry(this, errCb, function(err, obj) {

      if (err) { return errCb(err); };
      if (!obj) {
        console.log('creating new user prefs for', user);
        obj = models.UserPreferences({
          name: noCaseRegExp(user),
          createdAt: new Date()
        });
      }
      // Update obj with a few properties from newPrefs
      // TODO whenever I add something to the model, I have to add it to 2
      //      additional places in the server. I'd rather add it to ZERO.
      var updatableProps = ['color', 'requeueVideos', 'selectedPlaylist',
                            'showChatImages', 'allowMuteStatus'];
      _.each(updatableProps, function(key) {
        if (newPrefs.hasOwnProperty(key)) {
          obj[key] = newPrefs[key];
        }
      });
      obj.save(function(err, obj, numAffected) {
        if (err) { return errCb(err); }
        callback(obj);
      });
    }));
  }

  this.fetchUserPreferences = function(user, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.UserPreferences.findOne({ name: noCaseRegExp(user) },
                                   wrapTry(this, errCb, function(err, res) {
      if (err) { return errCb(err); }
      if (!res) {
        console.log('no prefs for', user);
        callback({});
      } else {
        callback(res);
      }
    }));
  }

  this.addKarma = function(karma, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    var record = new models.Karma(karma);
    record.save(function (err, record) {
      if (err) { return errCb(err); };
      console.log("saved karma", karma);
      callback(record);
    });
  }

  this.getKarmaByDay = function(callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    var weekdays = {
      '0': 'Sunday',
      '1': 'Monday',
      '2': 'Tuesday',
      '3': 'Wednesday',
      '4': 'Thursday',
      '5': 'Friday',
      '6': 'Saturday',
      '7': 'Sunday'
    };
    models.Karma.mapReduce({
      map: function() { emit(this.givenAt.getDay(), this.value) },
      reduce: function(k, vs) { return vs.reduce(function(a,b){return a+b}); },
    }, wrapTry(this, errCb, function(err, fetched) {
      var map = _(fetched).map(function(x) { return [weekdays[x._id], x.value]; })
                          .fromPairs()
                          .value();
      callback(map);
    }));
  }

  this.getTotalKarma = function(callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    db.getKarmaByDay(function(result) {
      callback(_(result).values().sum());
    }, errCb);
  }

  // Returns { user: { type: amount, ... } }
  this.getKarmaReceived = function(callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.Karma.mapReduce({
      map: function() {
        var val = {};
        val[this.type] = this.value;
        emit(this.recipient, val)
      },
      reduce: function(k, vs) {
        return vs.reduce(function(a, b){
          for (key in b) {
            if (!a[key]) { a[key] = 0; }
            a[key] += b[key];
            return a;
          }
        });
      },
    }, wrapTry(this, errCb, function(err, fetched) {
      var map = _(fetched).map(function(x) { return [x._id, x.value]; })
                          .fromPairs()
                          .value();
      callback(map);
    }));
  }

  // Returns { user: { type: amount, ... } }
  this.getKarmaGiven = function(callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.Karma.mapReduce({
      map: function() {
        var val = {};
        val[this.type] = this.value;
        emit(this.giver, val)
      },
      reduce: function(k, vs) {
        return vs.reduce(function(a, b){
          for (key in b) {
            if (!a[key]) { a[key] = 0; }
            a[key] += b[key];
            return a;
          }
        });
      },
    }, wrapTry(this, errCb, function(err, fetched) {
      var map = _(fetched).map(function(x) { return [x._id, x.value]; })
                          .fromPairs()
                          .value();
      callback(map);
    }));
  }

  this.getKarmaBuddies = function(callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.Karma.mapReduce({
      map: function() {
        var userPair = this.giver + "->" + this.recipient;
        emit(userPair, this.value)
      },
      reduce: function(k, vs) {
        return vs.reduce(function(a, b){ return a + b; });
      },
    }, wrapTry(this, errCb, function(err, fetched) {
      var map = _(fetched).map(function(x) { return [x._id, x.value]; })
                          .fromPairs()
                          .value();
      callback(map);
    }));
  }

  this.getBestLikedVideos = function(callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.Karma.mapReduce({
      map: function() {
        emit(this.context, this.value)
      },
      reduce: function(k, vs) {
        return vs.reduce(function(a, b){ return a + b; });
      },
      query: { type: 'video' }
    }, wrapTry(this, errCb, function(err, fetched) {
      var map = _(fetched).map(function(x) { return [x._id, x.value]; })
                          .fromPairs()
                          .value();
      callback(map);
    }));
  }

  // Returns { KARMA_TYPE_1: AMOUNT, KARMA_TYPE_2: AMOUNT }
  this.getUserKarmaMap = function(user, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    models.Karma.mapReduce({
      map: function() { emit(this.type, this.value) },
      reduce: function(k, vs) { return vs.reduce(function(a,b) {return a+b}); },
      query: { recipient: user },
    }, function(err, result) {
      if (err) { return errCb(err); };
      var map = _(result).map(function(x) { return [x._id, x.value]; })
                         .fromPairs()
                         .value();
      callback(map);
    });
  };

  // Returns user's total karma (of all types)
  this.getUserKarmaTotal = function(user, callback, errCb) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    db.getUserKarmaMap(user, function(m) {
      callback(_(m).values().sum());
    }, errCb)
  }

  this.drop = function(callback) {
    if (typeof errCb !==  'function') { errCb = defaultErrCb; }
    if (!process.env.TEST || config.mongodb_db === 'jub-dj') {
      console.error("Tried to drop data but TEST not set or DB === jub-dj");
      return;
    }
    console.log("DB: dropping data for", config.mongodb_db);
    var series = _.chain(models)
      .values()
      .map(function(m) { return function(done) { m.remove({}, done); }; })
      .value();

      // After all the steps are done, call `callback`
      series.push(function(done) { callback(); done() });
      async.series(series);
  }

  this.fixtures = function(data, callback) {
    if (!process.env.TEST) return;
    if (config.mongodb_db === 'jub-dj') return;

    db.drop(callback);

    // TODO populate DB with fixture data
  }

  this.stop = function() {
    console.log('DB: stopping');
    conn.close();
  }
}

module.exports = function(config, models, auth) {
  return new DB(config, models, auth);
}
