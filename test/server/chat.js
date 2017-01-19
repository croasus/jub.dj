require('../../lib/logging')(null, null, '-', '-');
var config = require('../config');

const TEST_USER = 'test_user';

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

var imitater = {
  imitate: function(user, callback) {
    callback('imitation');
  }
}

var bot = require('../../lib/bot')(config, gapi, twitter, urban, imitater);
bot.get_latest_updates = function() {
  return {
    date: '2015-01-01',
    list: [
      'Update 1',
      'Update 2'
    ]
  };
}

var chat = require('../../lib/chat')(config, bot);

chat.jub = (function() {
  return {
    updateUserPreferences: function(user, update) {
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
chat.saveChatMsg = function(obj) {};

// Test cases
function testCase(msg) {
  console.log('\n===', msg, '===');
}

testCase('A client sends a message');
chat.newChatMessage({
  user: TEST_USER,
  text: 'hey!'
});

// A username should be assigned by the time the chat module gets the message
testCase('A no-name client sends a message');
chat.newChatMessage({
  user: undefined,
  text: 'hey!'
});

testCase('A client emotes');
chat.newChatMessage({
  user: TEST_USER,
  text: '/me sees the world spinning round'
});

testCase('A client impersonates the bot');
chat.newChatMessage({
  user: bot.name,
  text: 'hahaha! I am the bot. Bot bot bot.'
});

testCase('A client flusters the bot');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': what is the meaning of the universe?'
});

testCase('A client asks the bot a valid question');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': how neat is that?'
});
testCase('A client rephrases the question');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': how neat is that monkey'
});

testCase('A client insults brice');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': brice sucks'
});

testCase('A client changes its color');
chat.newChatMessage({
  user: TEST_USER,
  text: '/color limegreen'
});

testCase('Test welcome message');
chat.welcome(TEST_USER, function(resp) {
  console.log('To send directly back to socket:\n', resp);
});

testCase('Test "video started" event');
chat.videoStarted({
  title: 'Rocko\'s modern life S1 E1',
  duration: 10000000,
  user: TEST_USER
});

testCase('Test "video started" event with no duration');
chat.videoStarted({
  title: 'Rocko\'s modern life S1 E1',
  user: TEST_USER
});

testCase('Test "video skipped" event');
chat.videoSkipped(TEST_USER);

testCase('A client uses "show me"');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': show me pickles'
});

testCase('A client uses "show me" and brice sucks');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': show me brice sucks'
});

testCase('Verify that saved chat objects include the time');
chat.saveChatMsg = function(obj) {
  console.log('has time?', obj.hasOwnProperty('time') && typeof obj.time == 'number');
}
chat.newChatMessage({
  user: TEST_USER,
  text: 'foo'
});

testCase('A client uses a hashtag in a message');
chat.newChatMessage({
  user: TEST_USER,
  text: 'This test passes #blessed'
});

testCase('A client uses # but not in an isolated hashtag');
chat.newChatMessage({
  user: TEST_USER,
  text: 'not#ahashtag'
});

testCase('A client asks urban dictionary for a definition');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: urban defined-word'
});

testCase('A client asks wtf is something');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: wtf is defined-word'
});

testCase('A client asks urban dictionary for a definition that doesn\'t exist');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: urban aldkfj,,,'
});

testCase('A client asks wtf is something that doesn\'t exist');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: wtf is aldkfj,,,'
});

testCase('A client asks for definition in a confusing way');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: wtf is urban defined-word'
});

testCase('A client asks for another definition in a confusing way');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: urban wtf is defined-word'
});

testCase('A client asks for help');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot: help'
});

testCase('A client uses "imitate"');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ': imitate ' + TEST_USER
});

testCase('A client addresses the bot with no colon');
chat.newChatMessage({
  user: TEST_USER,
  text: 'jubbot urban defined-word'
});

testCase('A client uses "show me" with no colon');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ' show me pickles'
});

testCase('A client uses "imitate" with no colon');
chat.newChatMessage({
  user: TEST_USER,
  text: bot.name + ' imitate ' + TEST_USER
});
