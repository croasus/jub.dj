var mongoose = require('mongoose');

// Note: schema <=> collection
function basicSchemas(config, auth) {
  return {
    AuthToken: {
      selector: { type: String, maxLength: 12, minLength: 12 },
        token: {
          type: String,
          set: auth.encodeToken
        },
        userId: { type: Number, min: 0 },
        createdAt: { type: Date, expires: '5d' }
    },
    UserPreferences: {
      name: { type: String, unique: true },
      createdAt: Date,
      color: String,
      selectedPlaylist: { type: String, default: 'sandbox' },
      // When enabled, add just-finished videos back to the user's queue
      requeueVideos: { type: Boolean, default: false },
      // When enabled, fetches linked images in chat and displays them
      showChatImages: { type: Boolean, default: false }
    },
    VideoPlay: {
      user: String,
      id: String,
      title: String,
      duration: Number,
      playedAt: Date,
      likes: Number,
      dislikes: Number,
      grabs: Number,
      skipped: Boolean
    }
  }
}

module.exports = function(config, auth) {
  var schemas = basicSchemas(config, auth);
  var models = {};
  for (var name in schemas) {
    models[name] = mongoose.model(name, mongoose.Schema(schemas[name]));
  }

  // Schemas with named subschemas
  //

  // Playlists
  var playlistVideoSchema = mongoose.Schema({
    position: Number,
    id: String,
    title: String,
    duration: Number
  });
  models.PlaylistVideo = mongoose.model('PlaylistVideo', playlistVideoSchema);

  var playlistSchema = mongoose.Schema({
    name: String,
    user: String,
    createdAt: Date,
    lastModifiedAt: Date,
    videos: [playlistVideoSchema]
  });
  playlistSchema.index({ name: 1, user: 1 }, { unique: true });
  models.Playlist = mongoose.model('Playlist', playlistSchema);

  return models;
};
