var util = require('../util');
module.exports = {
  'Update preferences (basic)' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('https://whatismybrowser.com')
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .pause(2000)
      .saveScreenshot('browser_test.png')
      .end();
  },
};
