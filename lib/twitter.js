require('./logging')();
var _ = require('lodash');

function Twitter(config) {
  var T = require('twitter-node-client').Twitter;
  var twitterConfig = config.twitter;
  var tapi = null;
  if (twitterConfig) tapi = new T(twitterConfig);
  var twitter = this;
  var NUM_RESULTS = 50;

  var error = function (err, response, body) {
    console.error('twitter error', err);
  };

  // Returns an Array of result objects
  this.search = function(query, cb) {
    if (!tapi) return;
    var params = {
      'q': query,
      'lang': 'en',
      'count': NUM_RESULTS
    };
    tapi.getSearch(params, error, function(resp) {
      var result = JSON.parse(resp);
      if (!(result.hasOwnProperty('statuses') && result.statuses.length > 0))
        return;
      cb(result.statuses);
    });
  }

  // Returns a random result's text
  this.searchOneText = function(query, cb) {
    if (!tapi) return;
    twitter.search(query, function(statuses) {
      var i = _.min([Math.floor((Math.random() * NUM_RESULTS)),
                    statuses.length - 1]);
      cb(statuses[i].text);
    });
  }
}

module.exports = function(config) {
  return new Twitter(config);
}
