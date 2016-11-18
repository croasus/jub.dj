let util = require('../util');
let config = require('../config');

let video_url = 'https://www.youtube.com/watch?v=DsAn_n6O5Ns';

module.exports = {
  'Delete more than 10 videos (#200)': function (browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementPresent('#beacon', util.DEFAULT_WAIT);
    for (let i = 0; i < 16; i++) {
      browser.setValue('#omnibox', video_url).submitForm('#load-video');
      browser.pause(200);
    }
    browser
      .elements('xpath', `//td[@class='track']`, function(result) {
        browser.assert.equal(result.value.length, 16);
      });
    browser.click('#select-all').pause(100).click('#delete-track').pause(200);
    browser
      .elements('xpath', `//td[@class='track']`, function(result) {
        browser.assert.equal(result.value.length, 0);
      });
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  }
}

