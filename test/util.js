var _ = require('lodash');
var fs = require ('fs');
var path = require ('path');

artifact_dir = process.env.JUB_TEST_ARTIFACT_DIR || path.join(__dirname, '../artifacts');
default_levels = ['ERROR', 'WARNING', 'INFO', 'DEBUG'];

module.exports = {
  DEFAULT_WAIT: 5000,
  logWriter: function logWriter(test_path, levels) {
    if (!levels) { levels = default_levels; }
    return function(entries) {
      if (!test_path) { throw "No test_path given"; }
        writePath = path.join(artifact_dir,
                              path.basename(test_path, '.js') + '.browserlog');
        if (fs.existsSync(writePath)) { fs.unlink(writePath); }
      _.each(entries, function(log) {
        data = '[' + log.level + ']' + log.timestamp + ' : ' + log.message + '\n';
        fs.appendFileSync(writePath, data);
      });
    }
  },
}
