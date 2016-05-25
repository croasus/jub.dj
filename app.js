var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var config_path = process.env.JUB_CONFIG || './config'
var config = require(config_path) || {
  private_route: '/foo',
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

config.private_route = config.private_route || '/foo';

// Create app components
app.auth = require('./lib/auth')(config);
app.models = require('./lib/models')(config, app.auth);
app.db = require('./lib/db')(config, app.models);
app.gapi = require('./lib/gapi')(config);
app.report = require('./lib/report')(app.db, app.gapi);
app.twitter = require('./lib/twitter')(config);
app.urban = require('./external_lib/urban');
app.bot = require('./lib/bot')(config, app.gapi, app.twitter, app.urban);
app.chat = require('./lib/chat')(config, app.bot);
app.jub = require('./lib/jub')(config, app.gapi, app.chat, app.db);
app.config = config;

// Note: in ./bin/www -> socket-routing.js, jub and chat are passed into
// socket-routing which gives them callbacks allowing them to *initiate*
// messages over the sockets


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

// TODO this will need to be per room
app.get('/report', function(req, res, next) {
  app.report.getKarmaReport(function(report) {
    var r =  JSON.stringify(report);
    console.log(r);
    res.render('report', { report: r }, function(err, html) {
      if (err) {
        console.error(err.message);
        next.send(html);
      } else {
        res.send(html);
      }
    });
  }, console.error);
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

/* scratch */
/*
var token = app.auth.genToken(function(token) {
  console.log("generated token:", token);
  console.log("encoded token:", app.auth.encodeToken(token));
  app.db.storeAuth('123456abcdef', token, 1);
});*/
/* scratch over */

module.exports = app;
