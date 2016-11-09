var util = require('../util');
let config = require('../config');
module.exports = {
  'Update preferences (basic)' : function (browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('#chat-settings-navtab-a', util.DEFAULT_WAIT)
      .verify.attributeEquals('#enable-mute-updates', 'checked', 'true')
      .expect.element('#show-chat-images').to.not.have.attribute('checked');
    browser
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', util.DEFAULT_WAIT)
      .click('input[id="show-chat-images"]')
      .click('input[id="enable-mute-updates"]')
      .verify.attributeEquals('#show-chat-images', 'checked', 'true')
      .expect.element('#enable-mute-updates').to.not.have.attribute('checked');
    browser
      .refresh()
      .waitForElementVisible('#chat-settings-navtab-a', util.DEFAULT_WAIT)
      .verify.attributeEquals('#show-chat-images', 'checked', 'true')
      .expect.element('#enable-mute-updates').to.not.have.attribute('checked');
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
};
