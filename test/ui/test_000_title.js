let config = require('../config')

module.exports = {
  'Basic test' : function (browser) {
    browser
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', 1000)
      .getText('#title', x => { browser.assert.equal(x.value, "thejub.pub"); })
      .end();
  }
};
