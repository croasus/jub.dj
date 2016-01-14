var async = require('async');

require('../lib/logging')(null, null, '-', '-');
var config = require('../test/config');

// Set up dependencies, with mocks
var gapi = (function() {
  return {
    one_image_link: function(query, cb) {
      console.log('gapi image search:', query);
      cb([ { link: 'http://pretend.image' } ]);
    },
    shorten_url: function(long_url, cb) {
      console.log('shorten url:', long_url);
      cb('http://pretend.shortened');
    },
  };
})();
var auth = require('../lib/auth')(config);
var models = require('../lib/models')(config, auth);
var socket = (function() {
  return {
    emit: function(channel, msg) {
      console.log('Socket emitting', channel, msg);
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
    jub.add_user('aromatt', socket, function(obj) {
      console.log('add_user callback')
      console.log(obj);
      done()
    });
  },
  function(done) {
    jub.add_dj('aromatt');
    done();
  },
  function(done) {
    jub.stop();
    done();
  }
]);
