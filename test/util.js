var _ = require('lodash');
var fs = require ('fs');
var path = require ('path');
let config = require('./config');

artifact_dir = process.env.JUB_TEST_ARTIFACT_DIR || path.join(__dirname, '../artifacts');
default_levels = ['ERROR', 'WARNING', 'INFO', 'DEBUG'];

let DEFAULT_WAIT = 10000;

module.exports = {
  DEFAULT_WAIT: DEFAULT_WAIT,

  logWriter: function logWriter(test_path, levels) {
    if (!levels) { levels = default_levels; }
    return function(entries) {
      if (!test_path) { throw "No test_path given"; }
        writePath = path.join(artifact_dir,
                              path.basename(test_path, '.js') + '.browserlog');
        if (fs.existsSync(writePath)) { fs.unlink(writePath); }
      _.each(entries, function(log) {
        data = '[' + log.level + ']' + log.timestamp + ' : ' + log.message + '\n';
        fs.appendFileSync(writePath, data);
      });
    }
  },

  // convenience for logging in
  login: function login(browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/login')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .waitForElementVisible('#login-username-input', DEFAULT_WAIT)
      .setValue('#login-username-input', config.test.user.name)
      .setValue('#login-password-input', config.test.user.password)
      .submitForm('#login-form')
      .pause(1000);
  },
}
