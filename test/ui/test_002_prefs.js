var DEFAULT_WAIT = 5000;
module.exports = {
  'Update preferences (basic)' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .waitForElementVisible('#chat-settings-navtab-a', DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', DEFAULT_WAIT)
      .click('#show-chat-images')
      .refresh()
      .waitForElementVisible('body', DEFAULT_WAIT)
      .waitForElementVisible('#chat-settings-navtab-a', DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .end();
  },
};
