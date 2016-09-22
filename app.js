var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var async = require("async");

var config_path = process.env.JUB_CONFIG || './config'
var config = require(config_path) || {
  private_room: 'foo',
  moved_message: 'Ask around for the new URL!'
};

var app = express();
require('./lib/logging')(app);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.pretty = true;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(
  path.join(__dirname, 'public'),
  {
    redirect: false
  }
));

config.private_room = config.private_room || 'foo';

// Create app components
app.auth = require('./lib/auth')(config);
app.models = require('./lib/models')(config, app.auth);
app.db = require('./lib/db')(config, app.models, app.auth);
app.gapi = require('./lib/gapi')(config);
app.report = require('./lib/report')(app.db, app.gapi);
app.twitter = require('./lib/twitter')(config);
app.urban = require('./external_lib/urban');
app.bot = require('./lib/bot')(config, app.gapi, app.twitter, app.urban);
app.chat = require('./lib/chat')(config, app.bot);
app.mail = require('./lib/mail')(config);
app.jub = require('./lib/jub')(config, app.gapi, app.chat, app.db, app.auth, app.mail);
app.config = config;

// XXX
app.bot.reloadUser = app.jub.reloadUser;

// Note: in ./bin/www -> socket-routing.js, some of the above objects are
// passed into socket-routing which gives them callbacks allowing them to
// *initiate* messages over the sockets

function simpleRender(view, res, data, next) {
  res.render(view, data, function(err, html) {
    if (err) {
      console.error(err.message);
      next.send(html);
    } else {
      res.send(html);
    }
  });
}

/* Routes */

function getSessionToken(req) {
  return req.cookies.sessionToken;
}

app.get('/dispatch', function(req, res, next) {
  simpleRender('dispatch', res, data, next);
});

// Blacklist middleware. Assumes we're behind a proxy and x-real-ip is the
// client's IP
app.use(function(req, res, next) {
  if (!req.headers || !req.headers['x-real-ip'] || !app.bot.blacklist) {
    return next();
  }
  if (app.bot.blacklist[req.headers['x-real-ip']]) {
    res.status(403);
    res.render('error', {
      message: 'Forbidden.',
    });
  } else {
    next();
  }
});

// Main room. If session token is present (as cookie) and valid, render the
// room. Otherwise, redirect to welcome page.
app.get('/' + config.private_room, function(req, res, next) {
  var token = getSessionToken(req);
  var welcomeRedirect = 'welcome?room=' + config.private_room;
  if (token) {
    console.log('validating session token');
    app.jub.validateSessionToken(token, function(valid) {
      if (valid) {
        var userKind = app.auth.parseToken(token).userKind;
        console.log('token is valid; about to render room');
        var data = {
          room: config.private_room,
          loggedIn: userKind === "account",
          show_login: true,
        };
        simpleRender('room', res, data, next);
      } else {
        res.redirect(welcomeRedirect);
      }
    });
  } else {
    res.redirect(welcomeRedirect);
  }
});

// TODO this will need to be per room
app.get('/report', function(req, res, next) {
  app.report.getKarmaReport(function(report) {
    console.log(r);
    var data = { report: JSON.stringify(report) };
    simpleRender('report', res, data, next);
  });
}, console.error);

// On this page, user can either sign up or log in. The client uses AJAX calls
// to create the account and/or log in, and ends up redirecting either to
// login-confirm or welcome page.
app.get('/login', function(req, res, next) {
  var token = getSessionToken(req) || '';
  var userKind = (app.auth.parseToken(token) || {}).userKind;

  // Don't show the login screen for already-logged in users
  app.jub.validateSessionToken(token, function(valid) {
    if (valid && userKind === 'account') {
      var redirect = '/logout';
      if (req.query.room) { redirect += '?room=' + req.query.room; }
      return res.redirect(redirect);
    } else {
      simpleRender('login', res, { room: req.query.room, show_login: false }, next);
    }
  });
}, console.error);

app.get('/logout', function(req, res, next) {
  simpleRender('logout', res, { room: req.query.room, show_login: false }, next);
}, console.error);

// AJAX endpoint, sets sessionToken, username and userKind cookies
app.post('/login', function(req, res, next) {
  var expiration = new Date();
  expiration = new Date(expiration.getTime() + 86400000 * 3);
  app.jub.login(req.body.username,
                req.body.password,
                expiration.getTime(),
                function(token) {
    var success = !!token;
    var data = { success: success };
    if (success) {
      // This cookie is HTTP only so client code can't access it
      res.cookie('sessionToken', token, { expires: expiration, httpOnly: true });
      // The client uses these cookies
      res.cookie('username', req.body.username, { expires: expiration });
      res.cookie('userKind', 'account', { expires: expiration });
      // TODO nickname?
    } else {
      data.errorMsg = 'Invalid username/password';
    }
    res.send(data);
  });
}, console.error);

// AJAX endpoint, sets sessionToken, username and userKind cookies
app.post('/logout', function(req, res, next) {
  res.cookie('sessionToken', '', { httpOnly: true });
  // The client uses these cookies
  res.cookie('username', '');
  res.cookie('userKind', '');
  res.send({ success: true });
}, console.error);

app.get('/request-password-reset', function(req, res, next) {
  simpleRender('request-password-reset', res, { room: req.query.room }, next);
}, console.error);

app.post('/request-password-reset', function(req, res, next) {
  app.jub.requestPasswordReset(req.body.username, function(success, message) {
    res.send({ success: success, message: message });
  });
}, console.error);

app.get('/reset-password-confirm', function(req, res, next) {
  simpleRender('reset-password-confirm', res, { }, next);
}, console.error);

app.get('/reset-password', function(req, res, next) {
  var token = req.query.token || '';
  var username = req.query.username || '';
  app.jub.validatePasswordResetToken(username,
                                     token,
                                     function(success, message) {
    var data = {
      valid: success,
      validationMessage: message,
    };
    if (success) {
      data.token = token;
      data.username = username;
    }
    simpleRender('reset-password', res, data, next);
  });
}, console.error);

// AJAX endpoint
app.post('/reset-password', function(req, res, next) {
  var token = req.body.token || '';
  var username = req.body.username || '';
  var password = req.body.password || '';
  app.jub.resetPassword(username, token, password,
                        function(success, message) {
    var data = {
      success: success,
      message: message
    };
    res.send(data);
  });
}, console.error);


// AXAJ endpoint, returns JSON { success, errorMsg }
app.post('/signup', function(req, res, next) {
  app.jub.signup(req.body.username, req.body.password, req.body.email,
                function(errorMsg) {
    var success = (errorMsg === null || errorMsg.length === 0);
    res.send({ success: success, errorMsg: errorMsg });
  });
}, console.error);

// AJAX endpoint, sets sessionToken, username and userKind cookies
app.post('/join-as-guest', function(req, res, next) {
  var expiration = new Date();
  expiration = new Date(expiration.getTime() + 86400000 * 3);
  console.log("attempting join as guest with nickname", req.body.nickname);
  app.jub.joinAsGuest(req.body.nickname,
                      expiration.getTime(),
                      function(token, errorMsg) {
    var success = !!token;
    var data = { success: success };
    if (success) {
      res.cookie('sessionToken', token, { expires: expiration, httpOnly: true });
      res.cookie('username', req.body.nickname, { expires: expiration });
      res.cookie('nickname', req.body.nickname, { expires: expiration });
      res.cookie('userKind', 'guest', { expires: expiration });
    } else {
      data.errorMsg = errorMsg;
    }
    res.send(data);
  });
}, console.error);

// If their session token is valid, say welcome and provide a link to get into
// the room (if they began by trying to get into a room). Otherwise, redirect
// back to the welcome page.
app.get('/login-confirm', function(req, res, next) {
  var token = getSessionToken(req);
  var room = null;
  var welcomeRedirect = 'welcome';
  if (req.query.room) {
    room = req.query.room;
    welcomeRedirect += '?room=' + room;
  }
  if (!token) {
    return res.redirect(welcomeRedirect);
  }
  app.jub.validateSessionToken(token, function(valid) {

    if (!valid) {
      return res.redirect(welcomeRedirect);
    }

    var userKind = app.auth.parseToken(token).userKind;
    var username = req.query.username;
    var data = {
      username: username,
      loggedIn: userKind === "account",
      show_login: true
    };
    if (room) { data.room = room; }
    async.series([
      function(done) {
        app.jub.fetchPreferencesFor(username, function(fetched) {
          if (fetched) {
            data.userColor = fetched.color || '#DDDDEE';
          }
          done();
        }, done);
      },
      function(done) {
        simpleRender('login-confirm', res, data, next);
        done();
      }
    ]);
  });
});

// Minimal message at '/' route
app.get('/', function(req, res, next) {
  var data = { message: config.moved_message };
  simpleRender('moved', res, data, next);
});

// TODO make this view
// Welcome -> create a nickname or an account
app.get('/welcome', function(req, res, next) {
  var data = { };
  if (req.query.room) { data.room = req.query.room; }
  simpleRender('welcome', res, data, next);
});

// Catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (process.env.TEST) {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  console.log(err.stack);
  res.status(err.status || 500);
  res.render('error', { });
});

module.exports = app;
