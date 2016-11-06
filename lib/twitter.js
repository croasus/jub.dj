require('./logging')();
let _ = require('lodash');

function Twitter(config) {
  let T = require('twitter-node-client').Twitter;
  let twitterConfig = config.twitter;
  let tapi = null;
  if (twitterConfig) tapi = new T(twitterConfig);
  let twitter = this;
  let NUM_RESULTS = 50;

  let error = function (err, response, body) {
    console.error('twitter error', err);
  };

  // Returns an Array of result objects
  this.search = function(query, cb) {
    if (!tapi) return;
    let params = {
      'q': query,
      'lang': 'en',
      'count': NUM_RESULTS
    };
    tapi.getSearch(params, error, resp => {
      let result = JSON.parse(resp);
      if (!(result.hasOwnProperty('statuses') && result.statuses.length > 0))
        return;
      cb(result.statuses);
    });
  }

  // Returns a random result's text
  this.searchOneText = function(query, cb) {
    if (!tapi) return;
    twitter.search(query, statuses => {
      let i = _.min([Math.floor((Math.random() * NUM_RESULTS)),
                    statuses.length - 1]);
      cb(statuses[i].text);
    });
  }
}

module.exports = function(config) {
  return new Twitter(config);
}
