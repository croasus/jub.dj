require('../../lib/logging')(null, null, '-', '-');
var path = require('path');
var config = require('../config');
var record = require('../record');
var gapi = require('../../lib/gapi')(config);
var recorder = record(path.basename(__filename, '.js'));

recorder.test(function(done) {
  gapi.shortenUrl('http://www.facebook.com', function(resp) {
    console.log('URL shortener resp', resp);
    done();
  });
});
