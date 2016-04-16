var lock = require('../lib/locked_function.js');

var doRelease = lock.passThrough(function(release, a, b, c) {
  console.log("doRelease", a, b, c);
  release();
}, function(err, result) {
  console.log("doRelease result");
}, { timeout: 10000 });
doRelease(1,2,3);
doRelease(4,5,6);
doRelease(7,8,9);

var noRelease = lock.passThrough(function(release, a, b, c) {
  console.log("noRelease", a, b, c);
}, function(err, result) {
  console.log("noRelease result (timeout)");
}, { timeout: 100 });
noRelease(1,2,3);
noRelease(4,5,6);

var noTimeout = lock.passThrough(function(release) {
  console.log("noTimeout");
  release();
});
noTimeout();


