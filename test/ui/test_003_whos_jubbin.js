var util = require('../util');
let config = require('../config');
let user = config.test.user.name;

module.exports = {
  "Users appear in Who's Jubbin' list": function(browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .click('#jubbin-list-navtab-a')
      .assert.containsText('#jubbin-list-tbody', user)
      .assert.containsText('#jubbin-list-tbody', 'jubbot')
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
  "Who's Jubbin' karma" : function (browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
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
