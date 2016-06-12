var RandBytes = new require('randbytes');
var crypto = require('crypto');
var bcrypt = require('bcrypt');
require('./logging')();

function Auth(config) {
  this.tokenLen =  config.auth.token_len || 32;
  this.HMACSecretLen =  config.auth.hmac_secret_len || 32;
  var auth = this;

  this.hashPassword = function(plain, callback, errCb) {
    if (typeof errCb !==  'function') {
      errCb = function(err) { console.error(err); };
    }
    bcrypt.genSalt(10, function(err, salt) {
      if (err) { return errCb(err); }
      bcrypt.hash(plain, salt, function(err, hash) {
        if (err) { return errCb(err); }
        callback(hash);
      });
    });
  };

  // TODO make sure this compare function's run time does not depend on
  // sameness; consider wrapping in a time-constant function
  this.checkPassword = function(plain, hash, callback) {
    bcrypt.compare(plain, hash, callback);
  };

  // sha256, returned in base64
  this.sha256base64 = function(token) {
    var shasum = crypto.createHash('sha256');
    shasum.update(token);
    return shasum.digest('base64');
  };

  // bytes from /dev/urandom/ --> hex [0..len]
  this.genToken = function(callback) {
    if (process.platform !== 'win32') {
      var randomSource = RandBytes.urandom.getInstance();

      randomSource.getRandomBytes(auth.tokenLen, function(buff) {
        var token = buff.toString('hex', 0, auth.tokenLen);
        callback(token);
      });
    }
  };

  // bytes from /dev/urandom/ --> SHA-256 --> base64
  this.genHMACSecret = function(callback) {
    if (process.platform !== 'win32') {
      var randomSource = RandBytes.urandom.getInstance();

      randomSource.getRandomBytes(64, function(buff) {
        var secret = auth.sha256base64(buff);
        callback(secret);
      });
    }
  };
}

// singleton
module.exports = function(config) {
  return new Auth(config);
}
