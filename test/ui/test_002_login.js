let util = require('../util');
let config = require('../config');

module.exports = {
  'Log in': function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/login?room=' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .waitForElementVisible('#login-username-input', util.DEFAULT_WAIT)
      .setValue('#login-username-input', config.test.user.name)
      .setValue('#login-password-input', config.test.user.password)
      .submitForm('#login-form')
      .pause(1000)
      .assert.urlEquals('http://localhost:3001/login-confirm?' +
                        'username=' + config.test.user.name + '&' +
                        'room=' + config.private_room)
      .assert.containsText('#login-confirm-welcome', config.test.user.name)
    browser
      .url('http://localhost:3001/' + config.private_room)
      .assert.urlEquals('http://localhost:3001/' + config.private_room)
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
};
