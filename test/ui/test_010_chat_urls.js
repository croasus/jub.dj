let util = require('../util');
let config = require('../config');

let URLS = {
  no_http: 'www.google.com',
  yes_http: 'http://www.google.com',
}

module.exports = {
  'URL formatting in chat': function (browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementPresent('#beacon', util.DEFAULT_WAIT);

    browser
      .useCss()
      .setValue('#chat-input', URLS.no_http)
      .submitForm('#chat')
      .pause(100)
      .useXpath()
      .expect.element(
        `//ul[@id='messages']/li[last()]/span/a[@href='http://${URLS.no_http}']`
      ).to.be.present.before(1000);
    browser
      .assert.containsText(
        "//ul[@id='messages']/li[last()]",
        URLS.no_http);

    browser
      .useCss()
      .setValue('#chat-input', URLS.yes_http)
      .submitForm('#chat')
      .pause(100)
      .useXpath()
      .expect.element(
        `//ul[@id='messages']/li[last()]/span/a[@href='${URLS.yes_http}']`
      ).to.be.present.before(1000);
    browser
      .assert.containsText(
        "//ul[@id='messages']/li[last()]",
        URLS.yes_http);

    browser
      .useCss()
      .setValue('#chat-input', `foo ${URLS.no_http} bar`)
      .submitForm('#chat')
      .pause(100)
      .useXpath()
      .expect.element(
        `//ul[@id='messages']/li[last()]/span/a[@href='http://${URLS.no_http}']`
      ).to.be.present.before(1000);
    browser
      .assert.containsText(
        "//ul[@id='messages']/li[last()]",
        `foo ${URLS.no_http} bar`);

    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
}
