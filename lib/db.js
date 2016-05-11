var util = require('util');
var mongoose = require('mongoose');
var mockgoose = require('mockgoose');
var async = require('async');
var _ = require('lodash');
require('./logging')();

function DB(config, models) {
  if (process.env.TEST) {
    mockgoose(mongoose, { port: 27018 });
    console.log('mocking mongoose! really?', mongoose.isMocked);
  }
  mongoose.connect(config.mongodb_endpoint + '/' + config.mongodb_db, function(err) {
    if (err) console.error(err);
  });
  var conn = mongoose.connection;
  var db = this;
  this.ready = false;

  conn.on('error', console.error.bind(console, 'connection error:'));
  conn.once('open', function (callback) {
    console.log("successful connection to db %s", config.mongodb_db);
    this.ready = true;
  });

  this.storeAuth = function(selector, token, userid, callback, errFn) {
    var a = new models.AuthToken({
      selector: selector,
      token: token,
      userId: userid,
      createdAt: Date.now()
    });

    /*
    a.save(function (err, a) {
      if (err) return console.error(err);
    });
    */
    console.log("auth object:", a); // TODO
  }

  // This is handy because mongoose will silence any errors that occur in
  // callbacks passed to its functions.
  function wrapTry(context, errCb, fn) {
    return function() {
      try {
        return fn.apply(context, arguments);
      } catch(err) {
        if (typeof errCb === 'function') {
          errCb(err);
        } else {
          console.error("Error caught in Mongoose callback:", err);
        }
      }
    }
  }

  this.deletePlaylist = function(user, playlistName, callback, errCb) {
    models.Playlist.remove({ user: user, name: playlistName}, function(err) {
      if (err) return errCb(err);
      callback();
    });
  }

  // - Provide a callback that accepts an array of videos and a function.
  // - Modify the array if you wish and then call the function. When you call
  //   that function, you may pass it yet another function which will be
  //   called after the model has been successfully saved.
  this.updatePlaylistVideos = function(user, playlistName, updateFn, errCb) {
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

          fetched.lastModifiedAt =  Date.now();
          fetched.save(function(err, obj, numAffected) {
            if (err) return errCb(err);
            finale();
          });
        });
      } else { // No updateFn
        fetched.lastModifiedAt =  Date.now();
        fetched.save();
      }
    }));
  }

  // TODO duplicated some with updatePlaylistVideos
  this.updateOrCreatePlaylistMeta = function(user, playlistName, updateFn, errCb) {
    if (!user || !playlistName) {
      return errCb({ message: "updateOrCreatePlaylistMeta: user and playlistName must be present" });
    }
    models.Playlist.findOne({ user: user, name: playlistName },
                            wrapTry(this, errCb, function(err, fetched) {
      console.log('updating/creating playlist', playlistName, 'for', user);
      if (err) return errCb(err);

      if (!fetched) {
        console.log('CREATING new playlist for', user, playlistName);
        fetched = models.Playlist({
          user: user,
          name: playlistName,
          createdAt: Date.now(),
          videos: []
        });
      }

      if (typeof updateFn == 'function') {
        // User modifies the playlist before we save it
        updateFn(fetched, function(post, finale) {
          fetched.lastModifiedAt =  Date.now();
          fetched.save(function(err, obj, numAffected) {
            if (err) return errCb(err);
            finale();
          });
        });
      } else { // No updateFn
        fetched.lastModifiedAt =  Date.now();
        fetched.save();
      }
    }));
  }

  // Fetch all playlists for user
  this.fetchOrInitPlaylists = function(user, callback, errCb) {
    if (!user) {
      return errCb({ message: "fetchOrInitPlaylists: user and playlistName must be present" });
    }
    models.Playlist.find({ user: user },
                         wrapTry(this, errCb, function(err, fetched) {
      if (err) { return errCb(err); }
      if (fetched.length == 0) {
        console.log('No playlists for', user);
        var playlists = []
        async.series([
          function(done) {
            // This is the 'init' part -- if no playlists for user, create 'sandbox'
            db.updateOrCreatePlaylistMeta(user, 'sandbox', function(playlist, doneUpdating) {
              // empty updateFn
              doneUpdating(playlist, done);
            }, errCb);
          },
          function(done) {
            db.fetchOrInitPlaylists(user, callback, errCb);
            done();
          }
        ]);
      } else {
        callback(fetched);
      }
    }));
  }

  this.updateOrCreateUserPreferences = function(user, newPrefs, callback, errCb) {
    models.UserPreferences.findOne({ name: user },
                                   wrapTry(this, errCb, function(err, obj) {

      if (err) { return errCb(err); };
      if (!obj) {
        console.log('creating new user prefs for', user);
        obj = models.UserPreferences({
          name: user,
          createdAt: Date.now()
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

  this.fetchOrInitUserPreferences = function(user, callback, errCb) {
    models.UserPreferences.findOne({ name: user },
                                   wrapTry(this, errCb, function(err, res) {
      if (err) { return errCb(err); }
      if (!res) {
        console.log('no prefs for', user, '; CREATING preferences');
        db.updateOrCreateUserPreferences(user, {}, callback, errCb);
      } else {
        callback(res);
      }
    }));
  }

  this.addKarma = function(karma, callback, errCb) {
    var record = new models.Karma(karma);
    record.save(function (err, record) {
      if (err) { return errCb(err); };
      console.log("saved karma", karma);
      callback(record);
    });
  }

  this.getKarmaByDay = function(callback, errCb) {
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
    db.getKarmaByDay(function(result) {
      callback(_(result).values().sum());
    }, errCb);
  }

  // Returns { user: { type: amount, ... } }
  this.getKarmaReceived = function(callback, errCb) {
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
    db.getUserKarmaMap(user, function(m) {
      callback(_(m).values().sum());
    }, errCb)
  }

  this.fixtures = function(data, callback) {
    if (!process.env.TEST) return;

    // drop all the existing data in the DB
    var series = _.chain(models)
      .values()
      .map(function(m) { return function(done) { m.remove({}, done); }; })
      .value();

    // TODO populate DB with fixture data

    // After all the steps are done, call `callback`
    series.push(function(done) { callback(); done() });
    async.series(series);
  }

  this.stop = function() {
    console.log('db stopping');
    conn.close();
  }
}

module.exports = function(config, models) {
  return new DB(config, models);
}
