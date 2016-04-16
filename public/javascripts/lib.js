/* Utility functions for the client */

function inspect(o, i) {
  if (typeof i=='undefined')i='';
  if (i.length>50) return '[MAX ITERATIONS]';
  var r = [];
  for(var p in o) {
    var t = typeof o[p];
    r.push(i + p + ' (' + t + '): ' +
           (t == 'object' ? 'object:' + xinspect(o[p], i + '  ') : o[p] + ''));
  }
}

function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length == 2)
    return parts.pop().split(";").shift();
  else
    return null;
}

function setCookie(name, value, expirationDate) {
  if (arguments.length < 3) {
    expirationDate = new Date();
    expirationDate.setFullYear( expirationDate.getFullYear() + 1 );
    expirationDate.toUTCString();
  }
  document.cookie = name + '=' + value + '; ' +
                    'expires=' + expirationDate;
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
  console.log(obj);
  return obj;
}

// Some globals
var socket = io();
