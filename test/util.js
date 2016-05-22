var _ = require('lodash');
var fs = require ('fs');
var path = require ('path');

artifact_dir = process.env.JUB_TEST_ARTIFACT_DIR || path.join(__dirname, '../artifacts');

module.exports = {
  DEFAULT_WAIT: 5000,
  writeLogs: function writeLogs(entries, levels) {
    if (!levels) { levels = ['ERROR', 'WARNING', 'INFO', 'DEBUG']; }
    _.each(entries, function(log) {
      writePath = path.join(artifact_dir, path.basename(__filename) + '.browserlog');
      data = '[' + log.level + ']' + log.timestamp + ' : ' + log.message + '\n';
      fs.appendFileSync(writePath, data);
    });
  },
}
