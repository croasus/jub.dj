var config_path = process.env.JUB_CONFIG || '../../config';
var config = require(config_path);
var auth = require('../../lib/auth')(config);
var models = require('../../lib/models')(config, auth);
var db = require('../../lib/db')(config, models);

var timer = null;
var drop = function drop() {
  if (db.ready) {
    if (timer) { timer.clear; }
    db.drop(function() {
      db.stop();
    });
  } else {
    timer = setTimeout(drop, 1000);
  }
};

drop();
