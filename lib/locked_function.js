/* Wraps the provided function in a limited-lifespan mutex, preventing reentry
 * into the function until the provided `release` function is called.
 *
 * Example:
 *
 * var noReentry = locked(function(release, a, b, c) {
 *
 *   db.find('foo', function(result) {
 *
 *     process(result);  // Assume this call is synchronous
 *
 *     release();        // Release the mutex here
 *
 *   }, release);        // We provide `release` as an error callback to `find`,
 *                       // so that the lock will be released even if the find
 *                       // fails
 *
 * }, 5000);             // Finally, if all else fails, the lock will be
 *                       // released in 5 seconds no matter what.
 *
 * TODO - support blocking mutex, and/or a queueing mechanism
 *      - support custom release/timeout functions
 *      - optionally raise an exception when lock cannot be obtained
 */
var DEFAULT_TIMEOUT = Infinity;

function passThrough() {
  var lock = null;
  var timeout = DEFAULT_TIMEOUT;
  var fn;
  var opts;
  var resultFn = function(err, result) {
    if (err) {
      return console.error(err);
    } else {
      return result;
    }
  };

  if (typeof arguments[0] !== 'function') {
    throw({ message: "First argument must be a function." });
  } else {
    fn = [].shift.apply(arguments);
  }

  if (typeof arguments[0] === 'function') {
    resultFn = [].shift.apply(arguments);
  }

  if (typeof arguments[0] === 'object') {
    opts = [].shift.apply(arguments);
    if (opts.hasOwnProperty('timeout')) {
      if (typeof opts.timeout === 'number') {
        timeout = opts.timeout;
      } else {
        throw({ message: "'timeout' must be a number" });
      }
    }
  }

  var release = function(err, result) {
    if (err) console.error(err);
    if (fn.lock == lock) { fn.lock = null; }
    clearTimeout(lock);
    resultFn(err, result);
  };
  var hold = function() {
    if (fn.lock) { return false; }
    fn.lock = lock = setTimeout(release, timeout);
    return true;
  };

  return function() {
    if (!hold()) { return; }
    [].unshift.apply(arguments, [release]);
    return fn.apply(fn, arguments);
  };
}

module.exports.passThrough = passThrough;
