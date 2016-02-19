var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var config = require('./config') || {
  private_route: '/foo',
  moved_message: 'Ask around for the new URL!'
};

var app = express();
require('./lib/logging')(app);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.pretty = true;

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(
  path.join(__dirname, 'public'),
  {
    redirect: false
  }
));

config.private_route = config.private_route || '/foo';

/* Routes */

// Main page
(function() {
  var slash = config.private_route[0] !== '/' ? '/' : '';
  app.get(slash + config.private_route, function(req, res, next) {
    res.render('index', { title: config.title }, function(err, html) {
      if (err) {
        console.error(err.message);
        next.send(html);
      } else {
        res.send(html);
      }
    });
  });
})();


// dummy path for testing path forwarding
app.get('/test_path', function(req, res, next) {
  res.render('test_path', {}, function(err, html) {
    if (err) {
      console.error(err.message);
      next.send(html);
    } else {
      res.send(html);
    }
  });
});

// favicon workaround for shitty DNS provider who won't forward arbitrary
// paths and won't let me set an explicit rule for a path with '.' in it
app.get('/favicon', function(req, res, next) {
  res.redirect('/favicon.ico');
});

// Minimal message at '/' route
app.get('/', function(req, res, next) {
  res.render('moved', { message: config.moved_message }, function(err, html) {
    if (err) {
      console.error(err.message);
      next.send(html);
    } else {
      res.send(html);
    }
  });
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
if (app.get('env') === 'development') {
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
  res.render('error', {
    message: err.message,
    error: {}
  });
});

app.auth = require('./lib/auth')(config);
app.models = require('./lib/models')(config, app.auth);
app.db = require('./lib/db')(config, app.models);
app.gapi = require('./lib/gapi')(config);
app.twitter = require('./lib/twitter')(config);
app.urban = require('./external_lib/urban');
app.bot = require('./lib/bot')(config, app.gapi, app.twitter, app.urban);
app.chat = require('./lib/chat')(config, app.bot);
app.jub = require('./lib/jub')(config, app.gapi, app.chat, app.db);
app.config = config;

// Note: in ./bin/www -> socket-routing.js, the jub receives a callback
// that allows it to *initiate* messages over the sockets


/* scratch */
/*
var token = app.auth.genToken(function(token) {
  console.log("generated token:", token);
  console.log("encoded token:", app.auth.encodeToken(token));
  app.db.storeAuth('123456abcdef', token, 1);
});*/
/* scratch over */

module.exports = app;
