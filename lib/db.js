var util = require('util');
var mongoose = require('mongoose');
var mockgoose = require('mockgoose');
var async = require('async');
var _ = require('lodash');
require('./logging')();

// Returns a mongoose connection
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

  this.storeAuth = function(selector, token, userid) {
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


  this.deletePlaylist = function(user, playlist_name, callback) {
    models.Playlist.remove({ user: user, name: playlist_name}, function(err) {
      if (err) return console.error(err);
      callback();
    });
  }

  // - Provide a callback that accepts an array of videos and a function.
  // - Modify the array if you wish and then call the function. When you call
  //   that function, you may pass it yet another function which will be
  //   called after the model has been successfully saved.
  this.updatePlaylistVideos = function(user, playlist_name, update_fn) {
    if (!user || !playlist_name)
      return;
    models.Playlist.findOne({ user: user, name: playlist_name }, function(err, fetched) {
      console.log('updating playlist videos', playlist_name, 'for', user);
      if (err) return console.error(err);
      if (!fetched) return console.log('no playlist', user, playlist_name);

      if (typeof update_fn == 'function') {
        // Present the update_fn with a sorted copy without 'position'. We will add
        // 'position' back after the update_fn is finished
        var processed = _.chain(fetched.videos)
          .sortBy(function(x) { return x.position; })
          .map(function(x) { return _.omit(x.toObject(), ['position', '_id']); })
          .value();

        // User modifies the videos and calls callback
        update_fn(processed, function(post, finale) {
          // Rebuild the video list using the videos + order returned
          fetched.videos = [];
          _.each(post, function(x, i) {
            x['position'] = i;
            fetched.videos.unshift(models.PlaylistVideo(x));
          });

          fetched.lastModifiedAt =  Date.now();
          fetched.save(function(err, obj, numAffected) {
            finale();
          });
        });
      } else { // No update_fn
        fetched.lastModifiedAt =  Date.now();
        fetched.save();
      }
    });
  }

  // TODO duplicated some with updatePlaylistVideos
  this.updateOrCreatePlaylistMeta = function(user, playlist_name, update_fn) {
    if (!user || !playlist_name)
      return;
    models.Playlist.findOne({ user: user, name: playlist_name }, function(err, fetched) {
      console.log('updating/creating playlist', playlist_name, 'for', user);
      if (err) return console.error(err);

      if (!fetched) {
        console.log('CREATING new playlist for', user, playlist_name);
        fetched = models.Playlist({
          user: user,
          name: playlist_name,
          createdAt: Date.now(),
          videos: []
        });
      }

      if (typeof update_fn == 'function') {
        // User modifies the playlist before we save it
        update_fn(fetched, function(post, finale) {
          fetched.lastModifiedAt =  Date.now();
          fetched.save(function(err, obj, numAffected) {
            if (err) return console.error(err);
            finale();
          });
        });
      } else { // No update_fn
        fetched.lastModifiedAt =  Date.now();
        fetched.save();
      }
    });
  }

  // Fetch all playlists for user
  this.fetchOrInitPlaylists = function(user, callback) {
    if (!user) { return; }
    models.Playlist.find({ user: user }, function(err, fetched) {
      if (err) return console.error(err);
      if (fetched.length == 0) {
        console.log('No playlists for', user);
        var playlists = []
        async.series([
          function(done) {
            // This is the 'init' part -- if no playlists for user, create 'sandbox'
            db.updateOrCreatePlaylistMeta(user, 'sandbox', function(playlist, done_updating) {
              // empty update_fn
              done_updating(playlist, done);
            });
          },
          function(done) {
            db.fetchOrInitPlaylists(user, callback);
            done();
          }
        ]);
      } else {
        callback(fetched);
      }
    });
  }

  this.updateOrCreateUserPreferences = function(user, newPrefs, callback) {
    models.UserPreferences.findOne({ name: user }, function(err, obj) {
      if (err) return console.error(err);
      if (!obj) {
        console.log('creating new user prefs for', user);
        obj = models.UserPreferences({
          name: user,
          createdAt: Date.now()
        });
      }
      // Update obj with a few properties from newPrefs
      for (key of ['color', 'requeueVideos', 'selectedPlaylist']) {
        if (newPrefs.hasOwnProperty(key)) {
          obj[key] = newPrefs[key];
        }
      }
      obj.save(function(err, obj, numAffected) {
        if (err) { return console.error(err); }
        callback(obj);
      });
    });
  }

  this.fetchOrInitUserPreferences = function(user, callback) {
    models.UserPreferences.findOne({ name: user }, function(err, res) {
      if (err) return console.error(err);
      if (!res) {
        console.log('no prefs; CREATING preferences');
        db.updateOrCreateUserPreferences(user, {}, callback);
      } else {
        callback(res);
      }
    });
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

// Currently returns a mongoose connection - later, abstract this
module.exports = function(config, models) {
  return new DB(config, models);
}
