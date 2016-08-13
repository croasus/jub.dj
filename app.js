var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

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
app.jub = require('./lib/jub')(config, app.gapi, app.chat, app.db, app.auth);
app.config = config;

// Note: in ./bin/www -> socket-routing.js, jub and chat are passed into
// socket-routing which gives them callbacks allowing them to *initiate*
// messages over the sockets

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

// Main page
app.get('/' + config.private_room, function(req, res, next) {
  var data = { room: config.private_room };
  console.log('cookies', req.cookies);
  simpleRender('room', res, data, next);
});

// TODO this will need to be per room
app.get('/report', function(req, res, next) {
  app.report.getKarmaReport(function(report) {
    console.log(r);
    var data = { report: JSON.stringify(report) };
    simpleRender('report', res, data, next);
  });
}, console.error);

app.get('/login', function(req, res, next) {
  simpleRender('login', res, { room: req.query.room }, next);
}, console.error);

// AJAX endpoint, returns { success, sessionToken, expiration in UTC epoch millis }
app.post('/login', function(req, res, next) {
  var expiration = new Date();
  expiration = new Date(expiration.getTime() + 86400000 * 3).getTime();
  app.jub.login(req.body.username,
                req.body.password,
                expiration,
                function(token) {
    var success = !!token;
    var data = { success: success };
    if (success) {
      data.sessionToken = token;
      data.expiration = expiration;
    } else {
      data.errorMsg = 'Invalid username/password';
    }
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

// TODO expect token and validate it before rendering
app.get('/signup-confirm', function(req, res, next) {
  app.jub.validateSessionToken(req.cookies.sessionToken, function(valid) {
    if (valid) {
      var data = { username: req.query.username };
      if (req.query.room && req.query.room !== '') {
        data.room = req.query.room;
      }
      simpleRender('signup-confirm', res, data, next);
    } else {
      res.redirect('welcome');
    }
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
  simpleRender('welcome', res, {}, next);
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
  res.status(err.status || 500);
  res.render('error', { });
});

/* scratch */
/*
var token = app.auth.genToken(function(token) {
  console.log("generated token:", token);
  console.log("encoded token:", app.auth.encodeToken(token));
  app.db.storeAuth('123456abcdef', token, 1);
});*/
/* scratch over */

module.exports = app;
