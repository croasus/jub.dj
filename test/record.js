// Set env var NOCK_RECORD to rerecord fixtures.
//
// inspired by https://github.com/garbados/mocha_nock_demo

var _nock = require('nock');
var shell = require('shelljs');
var path = require('path');
var fs = require('fs');

module.exports = function (name, options) {
  // options tell us where to store our fixtures
  options = options || {};
  var fixturesDir = options.fixturesDir || path.join('test', 'fixtures');
  var fixturePath = path.join(fixturesDir, name + '.js');

  // NOCK_RECORD indicates that we should rerecord the fixtures.
  var record = !!process.env.NOCK_RECORD;

  return {
    test: function (testFn) {
      try {
        var st = fs.statSync(fixturePath);
      } catch (e) {
        if (e.code == 'ENOENT')
          record = true;
        else
          throw e;
      }
      if (record) {
        _nock.recorder.rec({
          dontPrint: true,
        });
      } else {
        require('../' + fixturePath);
      }

      // Run the test
      testFn(function() {

        // Save the recording if we're recording
        if (record) {
          var fixtures = _nock.recorder.play();
          var text = "var nock = require('nock');\n" + fixtures.join('\n');
          shell.mkdir('-p', fixturesDir);
          fs.writeFile(fixturePath, text);
        }
      });
    }
  }
}
