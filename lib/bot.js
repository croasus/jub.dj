require('./jub_util').monkeyPatch();
require('./logging')();

function Bot(config, gapi, twitter, urban) {
  this.name = "jubbot";
  console.log('bot initialized with name', this.name);
  var bot = this;

  function botMsgObj(text) {
    return {
      text: text,
      user: bot.name
    }
  }

  this.say = function(text, callback) {
    callback(botMsgObj(text));
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
    callback(botMsgObj(msg));
  }

  // Provide a callback that accepts a response as a message object
  this.newChatMessage = function(msgObj, callback) {
    var msg = msgObj['text'];

    // Messages addressed to the bot
    if (msg.startsWith(this.name + ':')) {
      msg = msg.substring(this.name.length + 2, msg.length);
      msg = msg.toLowerCase();
      console.log('bot received new message:', msg);
      var response = '';
      var query;
      if (msg.search(/^penis/) >= 0) {
        callback(botMsgObj("Dude I don't like dick. Not that there's anything wrong with that."));
      }
      else if (msg.search(/^brice su(x|cks)/) >= 0) {
        callback(botMsgObj("BRICE SUUUUUX. But Whit kind of does too."));
      }
      else if (msg.search(/^how neat is that/) >= 0) {
        callback(botMsgObj("spurty neat"));
      }
      else if (msg.search(/^how cute is that/) >= 0) {
        callback(botMsgObj("cute af"));
      }
      else if (msg.search(/^show me /) >= 0) {
        query = msg.split(/^show me /);
        if (query.length > 1) {
          gapi.oneImageLink(query[1], function(link) {
            gapi.shortenUrl(link, function(shortlink) {
              callback(botMsgObj(shortlink));
            });
          });
        }
      } else if (msg.search(/^urban /) >= 0) {
        query = msg.split(/^urban /);
        if (query.length > 1) {
          var res = urban(query[1]);
          res.first(function(json) {
            var displayMsg = '"' + query[1] + '"? I dunno.';
            if( json && json.hasOwnProperty('definition')) {
              displayMsg = query[1] + ': ' + json.definition;
            }
            callback(botMsgObj(displayMsg));
          });
        }
      } else {
        callback(botMsgObj("I dunno."));
      }
    } else { // Not addressed to the bot
      if (msg.search(/#[\w]/) >= 0) {
        var re = /#([\w]+)/;
        query = re.exec(msg)[0];
        if (query) {
          twitter.searchOneText(query, function(tweet) {
            callback(botMsgObj(tweet));
          });
        }
      }
    }
  }

  this.videoStarted = function(videoObj, callback) {
    if (videoObj.title) {
      var msg = videoObj.user + ' started "' + videoObj.title + '"'
      callback(botMsgObj(msg));
    }
  }

  this.videoSkipped = function(user, callback) {
    var msg = (user || 'Someone') + ' decided to skip.';
    callback(botMsgObj(msg));
  }
}

module.exports = function(config, gapi, twitter, urban) {
  return new Bot(config, gapi, twitter, urban);
}
