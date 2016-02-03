var morgan = require('morgan');
var moment = require('moment');

// Unifies log format between express app and the rest of the application.
// Formats can be overriden for testing purposes.
module.exports = function(app, stampOpts, momentFormat, morganFormat) {
  if (typeof stampOpts == 'undefined')
    stampOpts = { pattern: 'yyyy-mm-dd HH:MM:ss.l' };

  if (typeof momentFormat == 'undefined')
    momentFormat = 'YYYY-MM-DD HH:mm:ss.SSS';

  if (typeof morganFormat == 'undefined')
    morganFormat = '[:date[iso]] [REQ]   ":method :url" :status :remote-addr';

  if (!this.set) {
    if (stampOpts)
      require('console-stamp')(console, stampOpts);
    if (app) {
      morgan.token('date', function(req, res) {
        return moment().format(momentFormat);
      });
      app.use(morgan(morganFormat));
    }
    this.set = true;
  }
}

// Include in most server-side files like this:
//
//   require('./logging')();
//
// Can make logging more suitable for baseline-based tests like this:
//
//   require('./logging')(null, null, '-', '-');
