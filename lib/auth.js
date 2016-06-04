var RandBytes = new require('randbytes');
var crypto = require('crypto');
var bcrypt = require('bcrypt');
require('./logging')();

function Auth(config) {
  this.tokenLen =  config.auth.token_len

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

  // sha256, returned in base64
  this.encodeToken = function(token) {
    var shasum = crypto.createHash('sha256');
    shasum.update(token);
    return shasum.digest('base64');
  };

  // bytes from /dev/urandom/ --> base64 --> [0..len]
  this.genToken = function(callback) {
    if(process.platform !== 'win32') {
      var randomSource = RandBytes.urandom.getInstance();

      randomSource.getRandomBytes( this.tokenLen, function( buff ) {
        var token = buff.toString( 'hex', 0, this.tokenLen );
        callback( token );
      }.bind(this) );
    }
  };
}

// singleton
module.exports = function(config) {
  return new Auth(config);
}
