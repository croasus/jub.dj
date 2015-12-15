require('./jub_util').monkey_patch();
require('./logging')();

function Bot(config, gapi, twitter) {
  this.name = "jubbot";
  console.log('bot initialized with name', this.name);
  var bot = this;

  function bot_msg_obj(text) {
    return {
      text: text,
      user: bot.name
    }
  }

  this.say = function(text, callback) {
    callback(bot_msg_obj(text));
  }

  this.welcome = function(user, callback) {
    var msg = 'Welcome'
    if (user && user.length > 0) { msg += ', ' + user; }
    msg += '!';

    if (config.latest_updates && config.latest_updates.list.length > 0) {
      msg += '\nLatest updates';
      if (config.latest_updates.date) {
        msg += ' (' + config.latest_updates.date + ')';
      }
      msg += ':\n' +
        config.latest_updates.list
        .map(function(str) { return '* ' + str; })
        .join('\n');
    }
    callback(bot_msg_obj(msg));
  }

  // Provide a callback that accepts a response as a message object
  this.new_chat_message = function(msg_obj, callback) {
    var msg = msg_obj['text'];

    // Messages addressed to the bot
    if (msg.starts_with(this.name + ':')) {
      msg = msg.substring(this.name.length + 2, msg.length);
      msg = msg.toLowerCase();
      console.log('bot received new message:', msg);
      var response = '';
      if (msg.search(/^penis/) >= 0) {
        callback(bot_msg_obj("Dude I don't like dick. Not that there's anything wrong with that."));
      }
      else if (msg.search(/^brice su(x|cks)/) >= 0) {
        callback(bot_msg_obj("BRICE SUUUUUX. But Whit kind of does too."));
      }
      else if (msg.search(/^how neat is that/) >= 0) {
        callback(bot_msg_obj("spurty neat"));
      }
      else if (msg.search(/^how cute is that/) >= 0) {
        callback(bot_msg_obj("cute af"));
      }
      else if (msg.search(/^show me /) >= 0) {
        var query = msg.split(/^show me /);
        if (query.length > 1) {
          gapi.one_image_link(query[1], function(link) {
            gapi.shorten_url(link, function(shortlink) {
              callback(bot_msg_obj(shortlink));
            });
          });
        }
      }
      else {
        callback(bot_msg_obj("I dunno."));
      }
    } else { // Not addressed to the bot
      if (msg.search(/#[\w]/) >= 0) {
        var re = /#([\w]+)/;
        var query = re.exec(msg)[0];
        if (query) {
          twitter.searchOneText(query, function(tweet) {
            callback(bot_msg_obj(tweet));
          });
        }
      }
    }
  }

  this.video_started = function(video_obj, callback) {
    if (video_obj.title) {
      var msg = video_obj.user + ' started "' + video_obj.title + '"'
      callback(bot_msg_obj(msg));
    }
  }

  this.video_skipped = function(user, callback) {
    var msg = (user || 'Someone') + ' decided to skip.';
    callback(bot_msg_obj(msg));
  }
}

module.exports = function(config, gapi, twitter) {
  return new Bot(config, gapi, twitter);
}
