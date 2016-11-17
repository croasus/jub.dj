var util = require('../util');
let config = require('../config');
let user = config.test.user.name;

module.exports = {
  "Logged-in user volume control and state": function(browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .waitForElementPresent('#beacon', util.DEFAULT_WAIT)
      .assert.value("#volume-slider", "75")
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-up")
      .click("#mute")
      .assert.value("#volume-slider", "0")
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-off")
      .refresh().waitForElementPresent('#beacon', util.DEFAULT_WAIT)
      .assert.value("#volume-slider", "0")
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-off")
      .click("#mute")
      .assert.value("#volume-slider", "75")
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-up")
      .refresh().waitForElementPresent('#beacon', util.DEFAULT_WAIT)
      .assert.value("#volume-slider", "75")
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-up")
    browser
      .click("#volume-slider")
      .expect.element("#volume-slider").to.have.value.which.matches(/49|50|51/);
    browser
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-up")
      .refresh().waitForElementPresent('#beacon', util.DEFAULT_WAIT)
      .expect.element("#volume-slider").to.have.value.which.matches(/49|50|51/);
    browser
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-up")
      .click("#mute")
      .assert.value("#volume-slider", "0")
      .click("#mute")
      .expect.element("#volume-slider").to.have.value.which.matches(/49|50|51/);
    browser
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
  "Who's Jubbin' mute status" : function (browser) {
    util.login(browser);
    browser.resizeWindow(1920, 1080)
      .url('http://localhost:3001/' + config.private_room)
      .waitForElementVisible('body', util.DEFAULT_WAIT)
      .refresh().waitForElementPresent('#beacon', util.DEFAULT_WAIT)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', util.DEFAULT_WAIT)
      .assert.cssClassPresent("#mute-icon", "glyphicon-volume-up")
      .assert.value("#volume-slider", "75")
      .useXpath().assert.cssProperty(
        `//td[@class='jub-name'][contains(., '${user}')]/../td[@class='jub-mute']/span`,
        'visibility',
        'hidden'
      )
      .useCss().click("#mute")
      .useXpath().assert.cssProperty(
        `//td[@class='jub-name'][contains(., '${user}')]/../td[@class='jub-mute']/span`,
        'visibility',
        'visible'
      )
      .useCss()
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', util.DEFAULT_WAIT)
      .click('input[id="enable-mute-updates"]')
      .pause(500)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', util.DEFAULT_WAIT)
      .useXpath().assert.cssProperty(
        `//td[@class='jub-name'][contains(., '${user}')]/../td[@class='jub-mute']/span`,
        'visibility',
        'hidden'
      )
      .useCss()
      .click('#chat-settings-navtab-a')
      .waitForElementVisible('#chat-settings-panel', util.DEFAULT_WAIT)
      .click('input[id="enable-mute-updates"]')
      .pause(500)
      .click('#jubbin-list-navtab-a')
      .waitForElementVisible('#jubbin-list', util.DEFAULT_WAIT)
      .useXpath().assert.cssProperty(
        `//td[@class='jub-name'][contains(., '${user}')]/../td[@class='jub-mute']/span`,
        'visibility',
        'visible'
      )
      .getLog('browser', util.logWriter(__filename))
      .end();
  },
}
