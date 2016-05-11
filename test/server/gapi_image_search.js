require('../../lib/logging')(null, null, '-', '-');
var path = require('path');
var config = require('../config');
var record = require('../record');
var gapi = require('../../lib/gapi')(config);
var recorder = record(path.basename(__filename, '.js'));

recorder.test(function(done) {
  gapi.oneImageLink('dry meal', function(link) {
    console.log('One link result:', link);
    done();
  });
});
