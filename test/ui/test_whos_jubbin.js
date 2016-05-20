var DEFAULT_WAIT = 5000;
module.exports = {
  /*
  'Who\'s Jubbin\' username cookie' : function (browser) {
    browser
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .setCookie({
        name: 'username',
        value: 'test_user',
        domain: 'localhost',
      })
      .refresh()
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', DEFAULT_WAIT)
      .assert.containsText('#jubbin-list-tbody', 'test_user')
      .assert.containsText('#jubbin-list-tbody', 'jubbot')
      .end();
  },*/

  /*
  'Who\'s Jubbin\' username form' : function (browser) {
    browser
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', DEFAULT_WAIT)
      .setValue('#username-input', 'test_user')
      .submitForm('#username')
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', DEFAULT_WAIT)
      .assert.containsText('#jubbin-list-tbody', 'test_user')
      .end();
  },
  'Who\'s Jubbin\' karma' : function (browser) {
    browser
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .waitForElementVisible('#chat-input', DEFAULT_WAIT)
      .setValue('#chat-input', '++jubbot')
      .submitForm('#chat')
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', DEFAULT_WAIT)
      .useXpath()
      .assert.containsText(
        "//td[@class='jub-name'][contains(., 'jubbot')]/../td[@class='jub-karma']",
        '1 karma'
      )
      .end();
  },*/
};
