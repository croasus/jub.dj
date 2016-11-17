let util = require('../util');
let config = require('../config');

let video_url = 'https://www.youtube.com/watch?v=DsAn_n6O5Ns';
let video_id = 'DsAn_n6O5Ns';
let video_title = 'WASTE  2 SECONDS OF YOUR LIFE';

module.exports = {
  'Add and remove a video': function (browser) {
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
      .useXpath()
      .click(
        `//td[@class='track'][contains(., '${video_title}')]/../td[@class='chk-td']/input`
      )
      .useCss().click('#delete-track')
      .expect.element(
        `//td[@class='track'][contains(., '${video_title}')]`
      ).to.not.be.present.before(1000);
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  }
}

