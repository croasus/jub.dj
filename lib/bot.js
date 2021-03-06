let jub_util = require('./jub_util');
let http = require('http');
let _ = require('lodash');
let ifLet = jub_util.ifLet;
jub_util.monkeyPatch();
require('./logging')();

function help(bot_name) {
  return `Hi! I answer questions and keep you updated on what's \
happening in the pub. Here are some examples of commands I understand:\n\n \
  ${bot_name}: urban ___ \n \
  ${bot_name}: wtf is ___ \n \
  ${bot_name}: show me ___ \n \
  ${bot_name}: how neat/cute is that? \n\n \
  ${bot_name}: imitate ___ \n\n \
I also keep track of karma points. Give someone karma with '++username', \
and check someone's karma with '!karma username' (karma is also displayed \
in the \"Who's jubbin'\" list).\n\n \
More tips:\n \
- Change your color by typing '/color COLOR' into chat, where COLOR can be \
  a hex code like #123456 or a name like 'blue'.`
}

function Bot(config, gapi, twitter, urban, imitater) {
  this.name = "jubbot";
  this.blacklist = {}; // ip => [user, user]
  console.log('bot initialized with name', this.name);
  let bot = this;
  let latest_updates = null;
  let bot_regex = new RegExp(`^${this.name}:? (.*)`);

  function botMsgObj(text) {
    return {
      text: text,
      user: bot.name
    }
  }

  this.say = function(text, callback) {
    callback(botMsgObj(text));
  }

  this.sayWithMeta = function(text, meta, callback) {
    let obj = botMsgObj(text);
    _.merge(obj, meta);
    callback(obj);
  }

  this.get_latest_updates = function() {
    if (latest_updates === null) {
      latest_updates = require('../latest_updates');
    };
    return latest_updates;
  }

  this.welcome = function(user, callback) {
    let msg = 'Welcome'
    if (user && user.length > 0) { msg += ', ' + user; }
    msg += '!';
    let updates = this.get_latest_updates();
    if (updates && updates.list.length > 0) {
      msg += '\nLatest updates';
      if (updates.date) {
        msg += ' (' + updates.date + ')';
      }
      msg += ':\n' +
        updates.list
        .map(str => { return '* ' + str; })
        .join('\n');
    }
    callback(botMsgObj(msg));
  }

  // Uses String.match and returns the nth match group or null.
  //
  // Example: `regex` is /foo (.*) (.*)/, `text` is "foo bar baz", and
  // `which` is 1, then the function would return "bar".
  function getMatchGroup(regex, text, which = 1) {
    return ifLet(text.match(regex), result => {
      if (result.length > 1) { // is there a ()?
        return result[which];
      }
    });
    return null;
  }

  this.isMessageForBot = function(msg) {
    return bot_regex.test(msg);
  }

  // Provide a callback that accepts a response as a message object
  this.newChatMessage = function(msgObj, callback) {
    let fullMsg = msgObj['text'];

    ifLet(getMatchGroup(bot_regex, fullMsg, 1), msg => {
      console.log('bot received new message:', msg);

      if (msg.toLowerCase() === 'help') {
        callback(botMsgObj(help(bot.name)));

      } else if (/^penis/i.test(msg)) {
        callback(botMsgObj("Dude I don't like dick. Not that there's anything wrong with that."));

      } else if (/^brice su(x|cks)/i.test(msg)) {
        callback(botMsgObj("BRICE SUUUUUX. But Whit kind of does too."));

      } else if (/^how neat is that/i.test(msg)) {
        callback(botMsgObj("spurty neat"));

      } else if (/^how cute is that/i.test(msg)) {
        callback(botMsgObj("cute af"));

      } else if (/^show me /i.test(msg)) {
        ifLet(getMatchGroup(/^show me (.*)/i, msg), query => {
          gapi.oneImageLink(query, link => {
            gapi.shortenUrl(link, shortlink => {
              callback(botMsgObj(shortlink));
            });
          });
        });

      } else if (/^(urban|wtf is) /i.test(msg)) {
        ifLet(getMatchGroup(/^(urban|wtf is) (.*)/i, msg, 2), query => {
          let res = urban(query);
          res.first(json => {
            let displayMsg = '"' + query + '"? I dunno.';
            if( json && json.hasOwnProperty('definition')) {
              displayMsg = query + ': ' + json.definition;
            }
            callback(botMsgObj(displayMsg));
          });
        });

      } else if (/^kick /i.test(msg)) {
        ifLet(getMatchGroup(/^kick (.*)/i, msg), user => {
          let ip = bot.getUserIP(user);
          // Can't kick someone who's not in the room
          if (!ip) {
            return callback(botMsgObj('I dunno who that is.'));
          }
          // Can't kick the bot
          if (user === bot.name) {
            return callback(botMsgObj('Haaaaaa.... nope.'));
          }
          // Can't kick whitelisted users
          if (_.includes(config.chat.whitelist || [], user)) {
            return callback(botMsgObj('B-but... I like ' + user + '. :-('));
          }
          // Can't kick an IP that is shared by a whitelisted user
          let whitelistIPs = _.reduce(config.chat.whitelist, (a, user) => {
            let ip = bot.getUserIP(user);
            a[ip] = _(a[ip]).concat(user).uniq().value();
            return a;
          }, {});
          if (_.has(whitelistIPs, ip)) {
            let culprits = whitelistIPs[ip].join(' and ');
            return callback(botMsgObj('It seems ' + user + ' is... ' + culprits));
          }
          // This IP is eligible for blacklisting, so blacklist it
          bot.blacklist[ip] = _(bot.blacklist[ip]).concat(user).uniq().value();
          console.log('blacklisted', user, ip);
          callback(botMsgObj('SEE YA, ' + user + '!!'));
          bot.reloadUser(user);
        });

      } else if (/^unkick /i.test(msg)) {
        ifLet(getMatchGroup(/^unkick (.*)/i, msg), user => {
          let ips = _(bot.blacklist)
            .pickBy((v, k) => { return _.includes(v, user); })
            .keys().value();
          if (ips.length === 0) {
            return callback(botMsgObj('I have no memory of kicking ' + user + '...'));
          }
          _.each(ips, ip => {
            bot.blacklist[ip] = _.without(bot.blacklist[ip], user);
            if (bot.blacklist[ip].length === 0) {
              delete bot.blacklist[ip];
            }
          });
          console.log('unblacklisted', user, ips);
          callback(botMsgObj('Ok, I guess ' + user + ' wasn\'t such a bad jub.'));
        });

      } else if (/^imitate /.test(msg)) {
        // This requires raw text files named by username in directory
        // config.markov_dir, as well as the `markgen` binary from
        // https://github.com/aatxe/markov on your PATH
        ifLet(getMatchGroup(/^imitate ([^\s]*)/i, msg), user => {
          imitater.imitate(user, function(answer) {
             callback(botMsgObj(answer));
          });
        });

      } else if (/^locate /i.test(msg)) {
        ifLet(getMatchGroup(/^locate (.*)/i, msg), user => {
          if (user === bot.name) {
            return callback(botMsgObj('Right behind you.'));
          }
          let ip = bot.getUserIP(user);
          if (!ip) {
            return callback(botMsgObj('I dunno who that is.'));
          }
          console.log('locating', user, ip);
          http.get('http://freegeoip.net/csv/' + ip, res => {
            let answer = '';
            let err = false;
            res.on('data', d => {
              answer += d;
            });
            res.on('end', d => {
              if (err) {
                return callback(botMsgObj('Couldn\'t find ' + user + '.'));
              }
              let parts = answer.split(',').slice(1,8);
              console.log("parts", parts);
              parts = parts.filter(p => p !== '');
              if (parts.length === 0) {
                return callback(botMsgObj('Nothing to say about ' + user + '.'));
              }
              callback(botMsgObj(parts.join('\n')));
            });
            res.on('error', e => {
              err = true;
              callback(botMsgObj('Couldn\'t find ' + user + '.'));
              console.error("geoip error:", e);
            });
          });
        });

      } else {
        callback(botMsgObj("I dunno."));
      }
    },
    // Else (not addressed to bot)
    _ => {
      if (/\B#\w+\b/.test(fullMsg)) {
        ifLet(getMatchGroup(/#(\w+)/, fullMsg, 0), query => {
          if (query) {
            twitter.searchOneText(query, tweet => {
              callback(botMsgObj(tweet));
            });
          }
        });
      }
    });
  };

  this.videoStarted = function(videoObj, callback) {
    if (videoObj.title) {
      let msg = videoObj.user + ' started ' +
                '"' + videoObj.title + '"';
      if (typeof videoObj.duration === 'number') {
        if ((typeof videoObj.clipStartTime === 'number') && (typeof videoObj.clipEndTime === 'number') && 
            (videoObj.clipEndTime - videoObj.clipStartTime) < videoObj.duration) {
          msg += ' (✂ ' + jub_util.formatTime((videoObj.clipEndTime - videoObj.clipStartTime)/1000) + ')';
        }
        else {
          msg += ' (' + jub_util.formatTime(videoObj.duration/1000) + ')';
        }
      }
      callback(botMsgObj(msg));
    }
  };

  this.videoSkipped = function(user, callback) {
    let msg = (user || 'Someone') + ' decided to skip.';
    callback(botMsgObj(msg));
  }
}

module.exports = function(config, gapi, twitter, urban, imitater) {
  return new Bot(config, gapi, twitter, urban, imitater);
};
