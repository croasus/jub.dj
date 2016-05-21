var DEFAULT_WAIT = 5000;
var _ = require('lodash');
var fs = require ('fs');
var path = require ('path');

artifact_dir = process.env.JUB_TEST_ARTIFACT_DIR || path.join(__dirname, '../artifacts');

function writeLogs(entries, levels) {
  if (!levels) { levels = ['ERROR', 'WARNING', 'INFO', 'DEBUG']; }
  _.each(entries, function(log) {
    writePath = path.join(artifact_dir, path.basename(__filename) + '.browserlog');
    data = '[' + log.level + ']' + log.timestamp + ' : ' + log.message + '\n';
    fs.appendFileSync(writePath, data);
  });
}

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
      .waitForElementVisible('body', DEFAULT_WAIT)
      .refresh()
      .pause(1000)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', DEFAULT_WAIT)
      .assert.containsText('#jubbin-list-tbody', 'test_user')
      .assert.containsText('#jubbin-list-tbody', 'jubbot')
      //.pause(30000)
      //.getLog('browser', writeLogs) // browser driver client server
      //.getLogTypes(console.log)
      .end();
  },*/
  'Who\'s Jubbin\' username form' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', DEFAULT_WAIT)
      .setValue('#username-input', 'test_user')
      .submitForm('#username')
      .refresh()
      .waitForElementVisible('body', DEFAULT_WAIT)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', DEFAULT_WAIT)
      .getLog('browser', writeLogs)
      .assert.containsText('#jubbin-list-tbody', 'test_user')
      .end();
  },

  'Who\'s Jubbin\' karma' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', DEFAULT_WAIT)
      .waitForElementVisible('#chat-input', DEFAULT_WAIT)
      .setValue('#chat-input', '++jubbot')
      .submitForm('#chat')
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', DEFAULT_WAIT)
      .getLog('browser', writeLogs)
      .useXpath()
      .assert.containsText(
        "//td[@class='jub-name'][contains(., 'jubbot')]/../td[@class='jub-karma']",
        '1 karma'
      )
      .end();
  },
};
