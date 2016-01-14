var jub_util = require('./jub_util')
var crypto = require('crypto');
var color = require('./color');
var path = require('path');
var moment = require('moment-timezone');
var fs = require('fs');
var shell = require('shelljs');
var readline = require('readline');
require('./logging')();
jub_util.monkey_patch();

/* message objects look like:
 *    {
 *      user:
 *      text:
 *      color:
 *      is_bot:
 *      ...
 *    }
 */

function Chat(config, bot) {
  this.bot = bot;
  var color_map = {};
  this.jub = null;    // Jub sets this TODO do this better
  var chat = this;
  var chat_config = config.chat || {};
  var cache_dir = chat_config.cache_dir || './chat_cache'

  shell.mkdir('-p', cache_dir);

  // These will be set by the socketeer
  this.broadcast = function() {};
  this.whisper = function() {};

  this.cache_path = function() {
    // Midnight in LA is a good time to roll over
    var timestamp = moment().tz('America/Los_Angeles').format('YYYY-MM-DD');
    return path.join(cache_dir, timestamp);
  }

  this.save_chat_msg = function(msg_obj) {
    var line = JSON.stringify(msg_obj) + '\n'
    fs.appendFile(chat.cache_path(), line, function(err) {
      if (err) {
        console.error('could not cache chat message', line, err.message);
      }
    });
  }

  // callback should accept an array of msg_objs
  // NOTE - entire file is read regardless of length; length limits the
  // number of lines sent over the socket.
  this.load_chat_cache = function(length, callback) {
    var path = chat.cache_path();
    var msg_objs = [];
    var end_early = false;
    fs.stat(path, function(err) {
      if (!err) {
        var stream = fs.createReadStream(path);
        var rl = readline.createInterface({ input: stream, end: 1 });
        rl.on('close', function() {
          callback(msg_objs.slice(-length));
        });
        rl.on('line', function(line, err) {
          if (err) {
            console.error(err);
            rl.close();
          }
          try {
            msg_objs.push(JSON.parse(line));
          }
          catch (e) {
            console.log('Could not parse cached chat:', line, e.message)
          }
        });
      }
    });
  }

  // Convenience wrappers
  this.broadcast_chat = function(msg_obj) {
    var xformed = transform_chat(msg_obj);
    chat.broadcast('chat message', xformed);

    xformed.time = Date.now();
    chat.save_chat_msg(xformed);
  }
  this.whisper_chat = function(user, msg_obj) {
    chat.whisper(user, 'chat message', transform_chat(msg_obj));
  }
  this.bot_say = function(text) {
    bot.say(text, chat.broadcast_chat);
  }

  // Sets or returns an initial color for the user
  this.color_for = function(user, color) {
    if (!user)
      return "#FFFFFF";
    if (color) {
      color_map[user] = color;
    } else if (user === bot.name) {
      return chat_config.bot_color || '#888899';
    } else if (user && !color_map[user]) {
      var hash = crypto.createHash('md5');
      hash.update(user);
      color_map[user] = '#' + hash.digest('hex').slice(3,9);
    }
    return color_map[user];
  }

  this.gen_username = function() {
    var hash = crypto.createHash('md5');
    hash.update(Date.now().toString());
    return 'jub-' + hash.digest('hex').slice(0, 7);
  }

  // Take in a chat obj sent from the client and turn into something we can
  // emit to display in the chat history
  function transform_chat(msg_obj) {
    msg_obj.is_bot = (msg_obj.user == bot.name);
    if (!msg_obj.hasOwnProperty('color'))
      msg_obj.color = chat.color_for(msg_obj.user);
    return msg_obj
  }

  // Callback should accept processed msg_obj
  function process_msg(msg_obj, callback) {
    if (!(msg_obj.user && msg_obj.text))
      return;

    // User is setting its color; stop after setting the color
    if (msg_obj.text.starts_with('/color ')) {
      chat.color_for(msg_obj.user, msg_obj.text.substring(7, msg_obj.text.length));
      console.log(msg_obj.user, 'set color to', chat.color_for(msg_obj.user));
      chat.jub.update_user_preferences(
        msg_obj.user,
        { color: chat.color_for(msg_obj.user) }
      );
      return;
    }

    // User is emoting
    if (msg_obj.text.starts_with('/me')) {
      msg_obj.text = msg_obj.text.substring(3, msg_obj.text.length);
      msg_obj.emote = true;
    }

    // Someone is impersonating the bot; change the text
    if (msg_obj.user == bot.name) {
      msg_obj = {
        user: bot.name,
        text: 'Someone just tried to impersonate me!'
      };
    }
    callback(msg_obj);
    bot.new_chat_message(msg_obj, chat.broadcast_chat);
  }

  // A user said something in chat
  this.new_chat_message = function(msg_obj) {
    process_msg(msg_obj, chat.broadcast_chat);
  }

  // A welcome banner for newly-connect users
  this.welcome = function(user) {
    bot.welcome(user, function(resp_obj) {
      chat.whisper_chat(user, resp_obj);
    });
  };

  // When there's a new video state, tell the bot and broadcast what he says
  this.video_started = function(new_state) {
    var startedCallback = function(msg_obj) {
      var userColor = this.color_for(new_state.user);
      msg_obj.customPanelBorder = color.colorNameToHex(userColor) || userColor;
      this.broadcast_chat(msg_obj);
    }.bind(this);
    bot.video_started(new_state, startedCallback);
  };

  // When a video is skipped, tell the bot and broadcast what he says
  this.video_skipped = function(user) {
    bot.video_skipped(user, this.broadcast_chat);
  }
}

module.exports = function(config, bot) {
  return new Chat(config, bot);
};
