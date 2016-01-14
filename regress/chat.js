require('../lib/logging')(null, null, '-', '-');
var config = require('../test/config');

const TEST_USER = 'test_user';

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

var twitter = (function() {
  return {
    searchOneText: function(query, cb) {
      console.log('twitter search:', query);
      cb("A twitter search result");
    }
  };
})();

var urbanDict = {
  'defined-word': {definition:'The definition'}
};
var urban = function(query) {
  return {
    first: function( callback ) {
      callback(urbanDict[query]);
    }
  }
};

var bot = require('../lib/bot')(config, gapi, twitter, urban);
var chat = require('../lib/chat')(config, bot);

chat.jub = (function() {
  return {
    update_user_preferences: function(user, update) {
      console.log('updating preference for', user, update);
    }
  };
})();

chat.broadcast = function(channel, obj) {
  console.log('broadcasting:\n', obj);
};
chat.whisper = function(user, channel, obj) {
  console.log('whispering:\n', obj);
};
chat.save_chat_msg = function(obj) {};

// Test cases
function testCase(msg) {
  console.log('\n===', msg, '===');
}

testCase('A client sends a message');
chat.new_chat_message({
  user: TEST_USER,
  text: 'hey!'
});

// A username should be assigned by the time the chat module gets the message
testCase('A no-name client sends a message');
chat.new_chat_message({
  user: undefined,
  text: 'hey!'
});

testCase('A client emotes');
chat.new_chat_message({
  user: TEST_USER,
  text: '/me sees the world spinning round'
});

testCase('A client impersonates the bot');
chat.new_chat_message({
  user: bot.name,
  text: 'hahaha! I am the bot. Bot bot bot.'
});

testCase('A client flusters the bot');
chat.new_chat_message({
  user: TEST_USER,
  text: bot.name + ': what is the meaning of the universe?'
});

testCase('A client asks the bot a valid question');
chat.new_chat_message({
  user: TEST_USER,
  text: bot.name + ': how neat is that?'
});
testCase('A client rephrases the question');
chat.new_chat_message({
  user: TEST_USER,
  text: bot.name + ': how neat is that monkey'
});

testCase('A client insults brice');
chat.new_chat_message({
  user: TEST_USER,
  text: bot.name + ': brice sucks'
});

testCase('A client changes its color');
chat.new_chat_message({
  user: TEST_USER,
  text: '/color limegreen'
});

testCase('Test welcome message');
chat.welcome(TEST_USER);

testCase('Test "video started" event');
chat.video_started({
  title: 'Rocko\'s modern life S1 E1',
  user: TEST_USER
});

testCase('Test "video skipped" event');
chat.video_skipped(TEST_USER);

testCase('A client uses "show me"');
chat.new_chat_message({
  user: TEST_USER,
  text: bot.name + ': show me pickles'
});

testCase('A client uses "show me" and brice sucks');
chat.new_chat_message({
  user: TEST_USER,
  text: bot.name + ': show me brice sucks'
});

testCase('Verify that saved chat objects include the time');
chat.save_chat_msg = function(obj) {
  console.log('has time?', obj.hasOwnProperty('time') && typeof obj.time == 'number');
}
chat.new_chat_message({
  user: TEST_USER,
  text: 'foo'
});

testCase('A client uses a hashtag in a message');
chat.new_chat_message({
  user: TEST_USER,
  text: 'This test passes #blessed'
});

testCase('A client asks urban dictionary for a definition');
chat.new_chat_message({
  user: TEST_USER,
  text: 'jubbot: urban defined-word'
});

testCase('A client asks urban dictionary for a definition that doesn\'t exist');
chat.new_chat_message({
  user: TEST_USER,
  text: 'jubbot: urban aldkfj,,,'
});
