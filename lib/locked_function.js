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
var DEFAULT_TIMEOUT = 1000;

function passThrough() {
  var lock = null;
  var timeout = Infinity;
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
      timeout = opts.timeout;
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
    fn.lock = lock = setTimeout(release, timeout || DEFAULT_TIMEOUT);
    return true;
  };

  return function() {
    if (!hold()) { return; }
    [].unshift.apply(arguments, [release]);
    return fn.apply(fn, arguments);
  };
}

function test() {
  var doRelease = passThrough(function(release, a, b, c) {
    console.log("doRelease", a, b, c);
    release();
  }, function(err, result) {
    console.log("doRelease result");
  }, { timeout: 10000 });
  doRelease(1,2,3);
  doRelease(4,5,6);
  doRelease(7,8,9);

  var noRelease = passThrough(function(release, a, b, c) {
    console.log("noRelease", a, b, c);
  }, function(err, result) {
    console.log("noRelease result (timeout)");
  }, { timeout: 1000 });
  noRelease(1,2,3);
  noRelease(4,5,6);

  var noTimeout = passThrough(function(release) {
    console.log("noTimeout");
    release();
  });
  noTimeout();
}

module.exports.passThrough = passThrough;
