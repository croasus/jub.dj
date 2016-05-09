var async = require('async');

require('../lib/logging')(null, null, '-', '-');
var config = require('../test/config');

// Set up dependencies, with mocks
var gapi = (function() {
  return {
    oneImageLink: function(query, cb) {
      console.log('gapi image search:', query);
      cb([ { link: 'http://pretend.image' } ]);
    },
    shortenUrl: function(longUrl, cb) {
      console.log('shorten url:', longUrl);
      cb('http://pretend.shortened');
    },
  };
})();
var auth = require('../lib/auth')(config);
var models = require('../lib/models')(config, auth);
var socket = (function() {
  return {
    emit: function(channel, msg) {
      console.log('Fake socket emitting', channel, msg);
    }
  }
})();
var jub, bot, db, chat;

async.series([
  function(done) {
    db = require('../lib/db')(config, models);
    db.fixtures({}, done);
  },
  function(done) {
    bot = require('../lib/bot')(config, gapi);
    chat = require('../lib/chat')(config, bot);
    jub = require('../lib/jub')(config, gapi, chat, db);
    console.log("adding user aromatt");
    jub.addUser('aromatt', socket, x => { done(); });
  },
  function(done) {
    jub.addDj('aromatt');
    done();
  },
  function(done) {
    jub.stop();
    done();
  }
]);
