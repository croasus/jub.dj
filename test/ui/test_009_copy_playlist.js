let util = require('../util');
let config = require('../config');

let video_url = 'https://www.youtube.com/watch?v=DsAn_n6O5Ns';
let video_id = 'DsAn_n6O5Ns';
let video_title = 'WASTE  2 SECONDS OF YOUR LIFE';

module.exports = {
  'Copy a playlist': function (browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementPresent('#beacon', util.DEFAULT_WAIT);
    browser
      .setValue('#omnibox', video_url)
      .submitForm('#load-video')
      .useXpath()
      .expect.element(
        `//td[@class='track'][contains(., '${video_title}')]`
      ).to.be.present.before(1000);
    browser
      .useCss()
      .click('#playlists-navtab-a')
      .elements('xpath', `//li[@class='playlist-item']`, function(result) {
        browser.assert.equal(result.value.length, 1);
      });
    browser
      .click('#copy-playlist').pause(200)
      .elements('xpath', `//li[@class='playlist-item']`, function(result) {
        browser.assert.equal(result.value.length, 2);
      })
      .useXpath()
      .expect.element(
        `//li[@class='playlist-item'][contains(., 'New playlist 1')]`
      ).to.be.present.before(1000);
    browser
      .useCss()
      .setValue('#playlist-name-input', 'foo')
      .submitForm('#playlist-form')
      .useXpath()
      .expect.element(
        `//li[@class='playlist-item'][contains(., 'foo')]`
      ).to.be.present.before(1000);
    browser
      .useCss()
      .click('#copy-playlist').pause(200)
      .elements('xpath', `//li[@class='playlist-item']`, function(result) {
        browser.assert.equal(result.value.length, 3);
      })
      .useXpath()
      .expect.element(
        `//li[@class='playlist-item'][contains(., 'foo 1')]`
      ).to.be.present.before(1000);
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  }
}

