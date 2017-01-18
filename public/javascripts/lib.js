/* Utility functions for the client */

const keys = {
  TAB: 9,
  RETURN: 13,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  SPACE: 32,
}

// credit to http://stackoverflow.com/questions/5357442/how-to-inspect-javascript-objects
function inspect(o, i) {
  if (typeof i === 'undefined') { i = ''; }
  if (i.length > 50) return '[MAX ITERATIONS]';
  var r = [];
  for(var p in o) {
    var t = typeof o[p];
    r.push(i + p + ' (' + t + '): ' +
           (t == 'object' ? 'object:' + inspect(o[p], i + '  ') : o[p] + ''));
  }
  return r.join(i + '\n');
}

function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length == 2)
    return parts.pop().split(";").shift();
  else
    return null;
}

function setCookie(name, value, expirationDate, extra) {
  if (arguments.length < 3) {
    expirationDate = new Date();
    expirationDate.setFullYear( expirationDate.getFullYear() + 1 );
    expirationDate.toUTCString();
  }
  var cookie = name + '=' + value + '; ' +
                  'expires=' + expirationDate;
  if (extra) {
    cookie = cookie + '; ' + extra;
  }
  document.cookie = cookie;
}

var getUsername = function() {
  return getCookie('username');
};

var getUserKind = function() {
  return getCookie('userKind') || null;
}

function formatTime(secs) {
  var time = new Date(1970, 1, 1); // Unix epoch
  var format = secs >= 3600 ? '%k:%M:%S' : '%M:%S';
  time.setSeconds(secs);
  var formatted = strftime(format, time);
  return formatted.replace(/^0+/, '');
}

// monkey-patch String with #startsWith
if ( typeof String.prototype.startsWith != 'function' ) {
  String.prototype.startsWith = function( substr ) {
    return this.indexOf(substr) === 0;
  }
};

// Memoized scrollbar width
function scrollbarWidth() {
  if (this.value)
    return this.value;

  var inner = document.createElement('p');
  inner.style.width = "100%";
  inner.style.height = "200px";

  var outer = document.createElement('div');
  outer.style.position = "absolute";
  outer.style.top = "0px";
  outer.style.left = "0px";
  outer.style.visibility = "hidden";
  outer.style.width = "200px";
  outer.style.height = "150px";
  outer.style.overflow = "hidden";
  outer.appendChild (inner);

  document.body.appendChild (outer);
  var w1 = inner.offsetWidth;
  outer.style.overflow = 'scroll';
  var w2 = inner.offsetWidth;
  if (w1 == w2) w2 = outer.clientWidth;

  document.body.removeChild (outer);

  this.value = (w1 - w2);
  return this.value;
};

// Vendor prefix
function vendor() {
  if (this.obj) return this.obj;
  var styles = window.getComputedStyle(document.documentElement, '');
  var pre = Array.prototype.slice.call(styles).join('').match(/-(moz|ms|webkit)-/)[1] || 'o';
  var dom = ('WebKit|Moz|MS|O').match(new RegExp('(' + pre + ')', 'i'))[1];
  this.obj = {
    dom: dom,
    lowercase: pre,
    css: '-' + pre + '-',
    js: pre[0].toUpperCase() + pre.substr(1)
  }
  return obj;
}

function areVideoClipSettingsValid(videoObj) {
  return videoObj.hasOwnProperty('clipStartTime')
      && videoObj.hasOwnProperty('clipEndTime')
      && ((videoObj.clipEndTime - videoObj.clipStartTime) < videoObj.duration);
}

function redirectToWelcome() {
  var url = '/welcome';
  var room = $('#which-room').val();
  if (room) { url = '/' + room; }
  window.location.href = url;
}

function getTextWidth(text) {
  var widthTest = $('<div>');
  widthTest.css({
    position: 'absolute',
    visibility: 'hidden',
    height: 'auto', width: 'auto',
    'white-space': 'nowrap'
  });

  // This is just an approximation; would not work in all fonts
  widthTest.text(text.replace(/\s/g, '.')).val();
  document.body.appendChild(widthTest[0]);
  var textWidth = widthTest[0].offsetWidth;
  document.body.removeChild(widthTest[0]);
  return textWidth;
}

// Like if-let in other languages.
// Calls `callback` with the result of `expression` iff that result is not
// false, null, or undefined; else calls `elseCallback`.
// Returns the result of calling the respective callback.
function ifLet(value, callback, elseCallback) {
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
}

// Traverses nested object `obj` using array `keys`.
// Returns _default or null if `undefined` is ever encountered
// while traversing.
function getIn(obj, keys, _default) {
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
}
