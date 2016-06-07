var jub_util = require('./jub_util');
var fs = require('fs');
var http = require('http');
var _ = require('lodash');
jub_util.monkeyPatch();
require('./logging')();

HELP_TEXT = "Hi! I answer questions and keep you updated on what's \
happening in the pub. Here are some examples of commands I understand:\n\n \
  jubbot: urban ___ \n \
  jubbot: show me ___ \n \
  jubbot: how neat/cute is that? \n\n \
I also keep track of karma points. Give someone karma with '++username', \
and check someone's karma with '!karma username' (karma is also displayed \
in the \"Who's jubbin'\" list).\n\n \
More tips:\n \
- Change your color by typing '/color COLOR' into chat, where COLOR can be \
  a hex code like #123456 or a name like 'blue'."

function Bot(config, gapi, twitter, urban) {
  this.name = "jubbot";
  console.log('bot initialized with name', this.name);
  var bot = this;
  var latest_updates = null;

  function botMsgObj(text) {
    return {
      text: text,
      user: bot.name
    }
  }

  this.say = function(text, callback) {
    callback(botMsgObj(text));
  }

  this.get_latest_updates = function() {
    if (latest_updates === null) {
      latest_updates = require('../latest_updates');
    };
    return latest_updates;
  }

  this.welcome = function(user, callback) {
    var msg = 'Welcome'
    if (user && user.length > 0) { msg += ', ' + user; }
    msg += '!';
    var updates = this.get_latest_updates();
    if (updates && updates.list.length > 0) {
      msg += '\nLatest updates';
      if (updates.date) {
        msg += ' (' + updates.date + ')';
      }
      msg += ':\n' +
        updates.list
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
      console.log('bot received new message:', msg);
      var query;
      if (msg.toLowerCase() === 'help') {
        var resp = HELP_TEXT;
        callback(botMsgObj(resp));
      } else if (msg.search(/^penis/i) >= 0) {
        callback(botMsgObj("Dude I don't like dick. Not that there's anything wrong with that."));
      } else if (msg.search(/^brice su(x|cks)/i) >= 0) {
        callback(botMsgObj("BRICE SUUUUUX. But Whit kind of does too."));
      } else if (msg.search(/^how neat is that/i) >= 0) {
        callback(botMsgObj("spurty neat"));
      } else if (msg.search(/^how cute is that/i) >= 0) {
        callback(botMsgObj("cute af"));
      } else if (msg.search(/^show me /i) >= 0) {
        query = msg.split(/^show me /i);
        if (query.length > 1) {
          gapi.oneImageLink(query[1], function(link) {
            gapi.shortenUrl(link, function(shortlink) {
              callback(botMsgObj(shortlink));
            });
          });
        }
      } else if (msg.search(/^urban /i) >= 0) {
        query = msg.split(/^urban /i);
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
      } else if (msg.search(/^kick /i) >= 0) {
        query = msg.split(/^kick /i);
        if (query.length > 1) {
          var user = query[1];
          if (user === bot.name) {
            return callback(botMsgObj('Haaaaaa.... nope.'));
          } else if (_.includes(config.chat.whitelist || [], user)) {
            return callback(botMsgObj('B-but... I like ' + user + '. :-('));
          }
          var ip = bot.getUserIP(user);
          if (!ip) {
            return callback(botMsgObj('I dunno who that is.'));
          }
          fs.appendFile(config.chat.blacklistPath, ip + '\n', function(err) {
            if (err) {
              return callback(botMsgObj('Crap, I suck. I couldn\'t make it happen.'));
            } else {
              return callback(botMsgObj('SEE YA, ' + user + '!!!'));
            }
          });
        }
      } else if (msg.search(/^locate /i) >= 0) {
        query = msg.split(/^locate /i);
        if (query.length > 1) {
          var user = query[1];
          if (user === bot.name) {
            return callback(botMsgObj('Right behind you.'));
          }
          var ip = bot.getUserIP(user);
          if (!ip) {
            return callback(botMsgObj('I dunno who that is.'));
          }
          console.log('locating', user, ip);
          http.get('http://freegeoip.net/csv/' + ip, function(res) {
            var answer = '';
            var err = false;
            res.on('data', function(d) {
              answer += d;
            });
            res.on('end', function(d) {
              if (err) {
                return callback(botMsgObj('Couldn\'t find ' + user + '.'));
              }
              var parts = answer.split(',').slice(1,8);
              console.log("parts", parts);
              parts = parts.filter(p => p !== '');
              if (parts.length === 0) {
                return callback(botMsgObj('Nothing to say about ' + user + '.'));
              }
              callback(botMsgObj(parts.join('\n')));
            });
            res.on('error', function(e) {
              err = true;
              callback(botMsgObj('Couldn\'t find ' + user + '.'));
              console.error("geoip error:", e);
            });
          });
        }
      } else {
        callback(botMsgObj("I dunno."));
      }
    } else { // Not addressed to the bot
      if (msg.search(/\B#\w+\b/) >= 0) {
        var re = /#(\w+)/;
        query = re.exec(msg)[0];
        if (query) {
          twitter.searchOneText(query, function(tweet) {
            callback(botMsgObj(tweet));
          });
        }
      }
    }
  };

  this.videoStarted = function(videoObj, callback) {
    if (videoObj.title) {
      var msg = videoObj.user + ' started ' +
                '"' + videoObj.title + '"';
      if (_.has(videoObj, 'duration')) {
        msg += ' (' + jub_util.formatTime(videoObj.duration/1000) + ')';
      }
      callback(botMsgObj(msg));
    }
  };

  this.videoSkipped = function(user, callback) {
    var msg = (user || 'Someone') + ' decided to skip.';
    callback(botMsgObj(msg));
  }
}

module.exports = function(config, gapi, twitter, urban) {
  return new Bot(config, gapi, twitter, urban);
};
