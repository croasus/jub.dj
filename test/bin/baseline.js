/* Regression testing tool. Test cases (regress/*.js) are run and each case's
 * output is compared with its corresponding baseline file. Any difference
 * between the test's baseline (regress/*.js.baseline) and the output of the
 * invoked test is considered a test failure. USAGE:
 *
 *   $ node test/bin/baseline.js [-v] [-b] [TEST_CASE [, ... ]]
 *
 * -b: write new baselines
 * -v: verbose (show diffs)
 *
 */

process.env.TEST = 1;

var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var sh = require('shelljs');
var colors = require('colors');
var childProcess = require('child_process');
var jsdiff = require('diff');

var REGRESS_DIR = 'test/server';
var MAX_WIDTH = 40;

function spacePad(str, width) {
  if (arguments.length < 2)
    width = str.length + 1;
  return str.slice(0, width - 1) + Array(width - str.length + 1).join(' ');
}

var exitCode = 0
var args = process.argv.slice(2);

// Parse args
var options = {
  writeBaselines: _.remove(args, function(a) { return a == '-b' })[0],
  verbose: _.remove(args, function(a) { return a == '-v' })[0]
}

// Accept test case paths; default to regress/*.js
var files;
if (args.length > 0) {
  files = _.filter(sh.ls(args), function(f) {
    return f.match(/.js$/);
  });
} else {
  files = sh.ls(path.join(REGRESS_DIR, '*.js'));
}

// Create a simple map for each test case
var testCases = _.map(files, function(file) {
  var hasBaseline = false;
  var baselinePath = file + '.baseline'
  try {
    fs.statSync(baselinePath)
    hasBaseline = true
  } catch (e) {
    if (e.code != 'ENOENT')
      throw e;
  }
  return {
    path: file,
    name: path.basename(file),
    baselinePath: baselinePath,
    hasBaseline: hasBaseline
  };
});

// Run the tests
console.log();
_.each(testCases, function(tc) {
  if (!(tc.hasBaseline || options.writeBaselines))
    return;

  process.stdout.write(spacePad(tc.name + ':', MAX_WIDTH));

  var invoked = childProcess.spawnSync('node', [tc.path], { stdio: 'pipe' });
  if (options.writeBaselines) {
    fs.writeFileSync(tc.baselinePath, invoked.stdout.toString());
    process.stdout.write('BASELINED\n'.blue);
  } else {
    var diff = jsdiff.diffLines(sh.cat(tc.baselinePath), invoked.stdout.toString());
    var pass = true;
    diff = _.filter(diff, function(line) {
      return line.added || line.removed;
    });
    if (diff.length > 0) {
      exitCode = 1;
      process.stdout.write('FAILED\n'.red);
      if (options.verbose) {
        _.each(diff, function(line) {
          var markup = line.added ? '+ ' + line.value : '- ' + line.value;
          process.stdout.write(markup);
        });
      }
    } else {
      process.stdout.write('PASSED\n'.green);
    }
  }
});

console.log();
sh.exit(exitCode);
