let util = require('../util');
let config = require('../config');

let guest_user = 'iamaguest';
let guest_message = 'guest message';

module.exports = {
  'Guest log in': function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/welcome?room=' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .waitForElementVisible('#nickname-input', util.DEFAULT_WAIT)
      .setValue('#nickname-input', guest_user)
      .submitForm('#join-as-guest')
      .pause(1000)
      .assert.urlEquals('http://localhost:3001/login-confirm?' +
                        'username=' + guest_user + '&' +
                        'room=' + config.private_room)
      .assert.containsText('#login-confirm-welcome', guest_user);
    browser
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .expect.element('#chat-settings-navtab-a').to.be.present;
    browser
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .expect.element('#show-chat-images').to.not.be.present;
    browser
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .expect.element('#enable-mute-updates').to.not.be.present;
    browser
      .url('http://localhost:3001/' + config.private_room)
      .assert.urlEquals('http://localhost:3001/' + config.private_room)
      .setValue('#chat-input', guest_message)
      .submitForm('#chat')
      .pause(100)
      .useXpath()
      .assert.containsText(
        "//ul[@id='messages']/li[last()]",
        guest_message);
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
};
