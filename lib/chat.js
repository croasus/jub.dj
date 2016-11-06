var jubUtil = require('./jub_util')
var crypto = require('crypto');
var color = require('./color');
var path = require('path');
var moment = require('moment-timezone');
var fs = require('fs');
var shell = require('shelljs');
var readline = require('readline');
var karma = require('./karma');
require('./logging')();
jubUtil.monkeyPatch();

/* message objects look like:
 *    {
 *      user:
 *      text:
 *      color:
 *      isBot:
 *      ...
 *    }
 */

function Chat(config, bot) {
  this.bot = bot;
  var colorMap = {};
  this.jub = null;    // Jub sets this TODO do this better
  var chat = this;
  var chatConfig = config.chat || {};
  var cacheDir = chatConfig.cache_dir || './chat_cache'

  shell.mkdir('-p', cacheDir);

  // These will be set by the socketeer
  this.broadcast = () => {};
  this.whisper = () => {};

  this.cachePath = function() {
    // Midnight in LA is a good time to roll over
    var timestamp = moment().tz('America/Los_Angeles').format('YYYY-MM-DD');
    return path.join(cacheDir, timestamp);
  }

  this.saveChatMsg = function(msgObj) {
    var line = JSON.stringify(msgObj) + '\n'
    fs.appendFile(chat.cachePath(), line, err => {
      if (err) {
        console.error('could not cache chat message', line, err.message);
      }
    });
  }

  // callback should accept an array of msgObjs
  // NOTE - entire file is read regardless of length; length limits the
  // number of lines sent over the socket.
  this.loadChatCache = function(length, callback) {
    var path = chat.cachePath();
    var msgObjs = [];
    fs.stat(path, err => {
      if (!err) {
        var stream = fs.createReadStream(path);
        var rl = readline.createInterface({ input: stream, end: 1 });
        rl.on('close', () => {
          callback(msgObjs.slice(-length));
        });
        rl.on('line', (line, err) => {
          if (err) {
            console.error(err);
            rl.close();
          }
          try {
            msgObjs.push(JSON.parse(line));
          }
          catch (e) {
            console.log('Could not parse cached chat:', line, e.message)
          }
        });
      }
    });
  }

  // Convenience wrappers
  this.broadcastChat = function(msgObj) {
    var xformed = transformChat(msgObj);
    chat.broadcast('chat message', xformed);

    xformed.time = Date.now();
    chat.saveChatMsg(xformed);
  }
  this.whisperChat = function(user, msgObj) {
    chat.whisper(user, 'chat message', transformChat(msgObj));
  }
  this.botSay = function(text) {
    bot.say(text, chat.broadcastChat);
  }

  // Sets or returns an initial color for the user
  this.colorFor = function(user, color) {
    if (!user)
      return "#FFFFFF";
    if (color) {
      colorMap[user] = color;
    } else if (user === bot.name) {
      return chatConfig.bot_color || '#888899';
    } else if (user && !colorMap[user]) {
      var hash = crypto.createHash('md5');
      hash.update(user);
      colorMap[user] = '#' + hash.digest('hex').slice(3,9);
    }
    return colorMap[user];
  }

  this.genUsername = function() {
    var hash = crypto.createHash('md5');
    hash.update(Date.now().toString());
    return 'jub-' + hash.digest('hex').slice(0, 7);
  }

  this.broadcastKarmaReport = function(user, amount, force) {
    if (amount % 5 > 0 && !force) { return; }
    chat.broadcastChat({
      user: bot.name,
      text: user + ' has ' + amount + ' karma!'
    });
  }

  // Take in a chat obj sent from the client and turn into something we can
  // emit to display in the chat history
  function transformChat(msgObj) {
    msgObj.isBot = (msgObj.user == bot.name);
    if (!msgObj.hasOwnProperty('color'))
      msgObj.color = chat.colorFor(msgObj.user);
    return msgObj;
  }

  // Callback should accept processed msgObj
  function processMsg(msgObj, callback) {
    if (!(msgObj.user && msgObj.text))
      return;

    // User is setting its color; stop after setting the color
    if (msgObj.text.startsWith('/color ')) {
      chat.colorFor(msgObj.user, msgObj.text.substring(7, msgObj.text.length));
      console.log(msgObj.user, 'set color to', chat.colorFor(msgObj.user));
      chat.jub.updateUserPreferences(
        msgObj.user,
        { color: chat.colorFor(msgObj.user) }
      );
      return;
    }

    // Someone asked how much karma someone has
    karma.parseForReport(msgObj.text, msgObj.user, user => {
      chat.jub.getKarma(user, sum => {
        chat.broadcastKarmaReport(user, sum, true);
      });
    });

    // Karma is being given
    karma.parseForGive(msgObj.text, msgObj.user, given => {
      chat.jub.giveKarmaAndGetTotal(given, sum => {
        chat.broadcastKarmaReport(given.recipient, sum);
      });
    });

    // User is emoting
    if (msgObj.text.startsWith('/me')) {
      msgObj.text = msgObj.text.substring(3, msgObj.text.length);
      msgObj.emote = true;
    }

    // Someone is impersonating the bot; change the text
    if (msgObj.user == bot.name) {
      msgObj = {
        user: bot.name,
        text: 'Someone just tried to impersonate me!'
      };
    }
    callback(msgObj);
    bot.newChatMessage(msgObj, chat.broadcastChat);
  }

  // A user said something in chat
  this.newChatMessage = function(msgObj) {
    processMsg(msgObj, chat.broadcastChat);
  };

  // A welcome banner for newly-connected users
  // Takes a callback because we do not want to use the usual wrappers which
  // would send the message to all the user's sockets.
  this.welcome = function(user, callback) {
    bot.welcome(user, respObj => {
      callback(transformChat(respObj));
    });
  };

  // When there's a new video state, tell the bot and broadcast what he says
  this.videoStarted = function(newState) {
    var startedCallback = (function(msgObj) {
      var userColor = this.colorFor(newState.user);
      msgObj.customPanelBorder = color.colorNameToHex(userColor) || userColor;
      this.broadcastChat(msgObj);
    }).bind(this);
    bot.videoStarted(newState, startedCallback);
  };

  // When a video is skipped, tell the bot and broadcast what he says
  this.videoSkipped = function(user) {
    bot.videoSkipped(user, this.broadcastChat);
  }
}

module.exports = function(config, bot) {
  return new Chat(config, bot);
};
