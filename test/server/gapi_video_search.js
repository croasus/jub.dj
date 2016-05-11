require('../../lib/logging')(null, null, '-', '-');
var path = require('path');
var config = require('../config');
var record = require('../record');
var gapi = require('../../lib/gapi')(config);
var recorder = record(path.basename(__filename, '.js'));

recorder.test(function(done) {
  gapi.videoSearch('epic ff8 medley', function(result) {
    console.log('Results:', result.length);
    console.log('First result:', result[0]);
    done();
  });
});
