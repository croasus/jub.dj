var fs = require('fs');
var path = require('path');
var strftime = require('strftime');

module.exports = {

  // Call to apply some monkey-patches various classes
  monkeyPatch: function() {

    if ( typeof String.prototype.startsWith != 'function' ) {
      String.prototype.startsWith = function( substr ) {
        return this.indexOf(substr) === 0;
      };
    };

    if ( typeof Array.prototype.partition != 'function' ) {
      Array.prototype.partition = function( iterator, thisArg ) {
        var trueCollection = [];
        var falseCollection = [];
        this.forEach((v, i, arr) => {
          if (iterator.call(thisArg, v, i, arr)) {
            trueCollection.push(v);
          } else {
            falseCollection.push(v);
          }
        });

        return [trueCollection, falseCollection];
      };
    };

    // Someone else suggested:
    //   myArray.reduce(Function.prototype.apply.bind(Array.prototype.concat))
    if ( typeof Array.prototype.flatten != 'function' ) {
      Array.prototype.flatten = function() {
        let recur = function(a) {
          return (a instanceof Array) ? ([].concat.apply([], a.map(recur))) : a
        };
        return recur(this);
      };
    };

    // Removes items from an Array by value, returning the removed items in an
    // Array. Inspired by
    // http://stackoverflow.com/questions/3954438/remove-item-from-array-by-value
    Array.prototype.remove = function() {
      var what, a = arguments, L = a.length, ax, removed = [];
      while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
          removed.push(this.splice(ax, 1));
        }
      }
      return removed.flatten();
    };
  },

  // Recursive object inspection
  inspect: function xinspect(o, i) {
    if (typeof i == 'undefined') i = '';
    if (i.length > 50) return '[MAX ITERATIONS]';
    var r = [];
    for(var p in o) {
      var t = typeof o[p];
      r.push(
        i + p + ' (' + t + '): ' +
        (t == 'object' ? 'object:' + xinspect(o[p], i + '  ') : o[p] + '')
      );
    }
    return r.join(i + '\n');
  },

  //http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
  knuthShuffle: function _shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  },

  // Clear an object's properties
  clearObj: function(obj) {
    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) { delete obj[prop]; }
    }
  },

  formatTime: function(secs) {
    let time = new Date(1970, 1, 1); // Unix epoch
    let format = secs >= 3600 ? '%k:%M:%S' : '%M:%S';
    time.setSeconds(secs);
    let formatted = strftime(format, time);
    return formatted.trim();
  },

  // Like if-let in other languages.
  // Calls `callback` with the result of `expression` iff that result is not
  // false, null, or undefined; else calls `elseCallback`.
  // Returns the result of calling the respective callback.
  ifLet: function ifLet(value, callback, elseCallback) {
    if (typeof callback === 'undefined') {
      callback = function(x) { return x; };
    }
    if (typeof elseCallback === 'undefined') {
      elseCallback = function(x) { return x; };
    }
    if (value !== undefined && value !== null && value !== false) {
      return callback(value);
    } else {
      return elseCallback(value);
    }
  },

  // Traverses nested object `obj` using array `keys`.
  // Returns _default or null if `undefined` is ever encountered
  // while traversing.
  getIn: function getIn(obj, keys, _default) {
    if (typeof _default === 'undefined') {
      _default = null;
    }
    if (keys.length === 0) {
      return obj;
    }
    if (typeof obj !== 'object') {
      return null;
    }
    if (keys.length === 1) {
      if (obj.hasOwnProperty(keys[0])) {
        return obj[keys[0]];
      } else {
        return _default;
      }
    } else {
      return getIn(obj[keys[0]], keys.slice(1), _default);
    }
  },

  // asynchronous mkdir -p
  // callback should accept (err, dir)
  mkdirP: function mkdirP(dir, callback) {
    fs.stat(dir, (err, stat) => {
      if (err && err.code == 'ENOENT') {
        let parent = path.dirname(dir);
        mkdirP(parent, err => {
          if (err) {
            if (callback)
              callback(err, parent);
            else
              throw err
          }
          fs.mkdir(dir, callback);
        });
      } else {
        if (callback) {
          callback(null, dir);
        }
      }
    });
  }
}
