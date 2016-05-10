module.exports = {
  'Basic test' : function (browser) {
    browser
      .url('http://localhost:3001/test_private_route')
      .waitForElementVisible('body', 1000)
      .assert.containsText('#title', 'thejub.pub')
      .end();
  }
};
