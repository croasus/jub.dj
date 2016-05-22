var util = require('../util');
module.exports = {
  'Update preferences (basic)' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .waitForElementVisible('#chat-settings-navtab-a', util.DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', util.DEFAULT_WAIT)
      .click('#show-chat-images')
      .refresh()
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .waitForElementVisible('#chat-settings-navtab-a', util.DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .getLog('browser', util.writeLogs)
      .end();
  },
};
