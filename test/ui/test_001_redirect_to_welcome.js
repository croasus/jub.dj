let config = require('../config')
var util = require('../util');

module.exports = {
  'Redirect to welcome' : function (browser) {
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('#login-panel', util.DEFAULT_WAIT);
    browser
      .assert.urlEquals('http://localhost:3001/welcome?room=' + config.private_room)
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
};
