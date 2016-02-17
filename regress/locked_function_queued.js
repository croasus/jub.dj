var lock = require('../lib/locked_function.js');

var queuedFn = lock.queued(function(release, a, doRelease) {
  console.log("value:", a);
  if (doRelease) {
    console.log("I will release.");
    setTimeout(release, 100);
  } else {
    console.log("I will not release; I will time out");
  }
}, { timeout: 100 });
queuedFn(1, true);
queuedFn(2, true);
queuedFn(3, true);
queuedFn(4, false);
console.log("Done queueing calls");
