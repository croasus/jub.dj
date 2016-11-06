var util = require('../util');
module.exports = {
  'Redirect to welcome' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('#login-panel', util.DEFAULT_WAIT);
    browser
      .assert.urlEquals('http://localhost:3001/welcome?room=test_private_route')
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
};
