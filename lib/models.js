let mongoose = require('mongoose');

// Note: schema <=> collection
function basicSchemas(config, auth) {
  return {
    UserPreferences: {
      name: { type: String, unique: true },
      passwordHash: String,
      emailAddress: String,
      createdAt: Date,
      color: String,
      selectedPlaylist: { type: String, default: 'sandbox' },
      // When enabled, add just-finished videos back to the user's queue
      requeueVideos: { type: Boolean, default: false },
      // When enabled, fetches linked images in chat and displays them
      showChatImages: { type: Boolean, default: false },
      // When enabled, allows other users to see client's mute status
      allowMuteStatus: {type: Boolean, default: true },
      // When enabled, shows animations in chat window
      showChatAnimations: { type: Boolean, default: true },
      // When enabled, autocompleted mentions include a space at the end
      addSpaceAfterMention: { type: Boolean, default: false },
    },
    ResetPassword: {
      user: { type: String, unique: true },
      token: String,
      grantedAt: Date,
      tokenSpent: { type: Boolean, default: false },
    },
    Karma: {
      type: String,
      value: Number,
      recipient: String,
      giver: String,
      context: String,
      givenAt: Date
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
  let schemas = basicSchemas(config, auth);
  let models = {};
  for (var name in schemas) {
    models[name] = mongoose.model(name, mongoose.Schema(schemas[name]));
  }

  // Schemas with named subschemas
  //

  // Playlists
  let playlistVideoSchema = mongoose.Schema({
    position: Number,
    id: String,
    title: String,
    duration: Number,
    clipStartTime: Number,
    clipEndTime: Number
  });
  models.PlaylistVideo = mongoose.model('PlaylistVideo', playlistVideoSchema);

  let playlistSchema = mongoose.Schema({
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
