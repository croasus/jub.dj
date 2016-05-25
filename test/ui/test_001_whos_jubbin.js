var util = require('../util');
module.exports = {
  /*
  'Who\'s Jubbin\' username cookie' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .setCookie({
        name: 'username',
        value: 'test_user',
        domain: null,       // Workaround for chrome issue
      })
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .refresh()
      .pause(1000)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', util.DEFAULT_WAIT)
      .assert.containsText('#jubbin-list-tbody', 'test_user')
      .assert.containsText('#jubbin-list-tbody', 'jubbot')
      .getLog('browser', util.logWriter(__filename))
      .end();
  },*/
  'Who\'s Jubbin\' username form' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', util.DEFAULT_WAIT)
      .setValue('#username-input', 'test_user')
      .submitForm('#username')
      .refresh()
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', util.DEFAULT_WAIT)
      .assert.containsText('#jubbin-list-tbody', 'test_user')
      .getLog('browser', util.logWriter(__filename))
      .end();
  },

  'Who\'s Jubbin\' karma' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .waitForElementVisible('#chat-input', util.DEFAULT_WAIT)
      .setValue('#chat-input', '++jubbot')
      .submitForm('#chat')
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', util.DEFAULT_WAIT)
      .useXpath()
      .assert.containsText(
        "//td[@class='jub-name'][contains(., 'jubbot')]/../td[@class='jub-karma']",
        '1 karma'
      )
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
};
