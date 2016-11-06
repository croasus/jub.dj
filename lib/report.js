var util = require('util');
var async = require('async');
var _ = require('lodash');
require('./logging')();

function Report(db, gapi) {
  var REPORT_LIST_LIMIT = 15;

  var filterNull = function(obj, callback) {
    if (typeof obj === 'object') {
      obj = _(obj).toPairs()
                  .filter(function(x) { return x[0] !== null && x[0] !== 'null'; })
                  .fromPairs()
                  .value();
    }
    callback(null, obj);
  }

  // Input must be either a single number of an object whose values are numbers
  var sum = function(val) {
    if (typeof val === 'object') {
      return _(val).values().sum();
    } else {
      return val;
    }
  }

  var reverseSortLimit = function(obj, callback) {
    obj = _(obj).toPairs()
                .sortBy(v => { return sum(v[1]); })
                .reverse()
                .take(REPORT_LIST_LIMIT)
                .fromPairs()
                .value();
    callback(null, obj);
  }

  var videoTitles = function(obj, callback) {
    var videoObjs = _(obj).toPairs()
                          .map(x => { return { id: x[0], hootCount: x[1] }; })
                          .value();
    async.reduce(videoObjs, {}, (memo, videoObj, nextReduce) => {
      gapi.videoSpecs(videoObj, result => {
        memo[result.title] = result.hootCount;
        nextReduce(null, memo);
      });
    }, (err, result) => {
      callback(null, result);
    });
  }

  // Calls `callback` with an array of { title: 'some title', data: [ 'some', 'data' ] },
  // collected using `reportSpec` as defined at the top of the function.
  // `data` may be an array, an object, or a single value.
  this.getKarmaReport = function(callback, errCb) {
    var reportSpec = [
      { title: 'Total karma given',
        fn: db.getTotalKarma },
      { title: 'Karma by day of the week',
        fn: db.getKarmaByDay },
      { title: 'Karma received by user',
        fn: db.getKarmaReceived,
        post: [filterNull, reverseSortLimit] },
      { title: 'Karma given by user',
        fn: db.getKarmaGiven,
        post: [filterNull, reverseSortLimit] },
      { title: 'Top karma buddies',
        fn: db.getKarmaBuddies,
        post: [filterNull, reverseSortLimit] },
      { title: 'Most-hooted videos',
        fn: db.getBestLikedVideos,
        post: [filterNull, reverseSortLimit, videoTitles] }
    ];
    async.reduce(reportSpec, [], (memo, sectionSpec, nextReduce) => {
      sectionSpec.fn(result => {
        // Prepare the post-processing fns
        var post = sectionSpec.post || [];

        // Kick off the waterfall with the initial data
        post.unshift(cb => { cb(null, result); });

        async.waterfall(post, (err, result) => {
          try {
            var result = { title: sectionSpec.title, data: result };
            memo.push(result);
            nextReduce(null, memo);
          } catch(err) {
            console.error("caught", err);
          }
        });
      });
    },
    // Once reduce is complete, return the full report
    (err, report) => {
      if (err) return errCb(err);
      callback(report);
    });
  }
}

module.exports = function(db, gapi) {
  return new Report(db, gapi);
}
