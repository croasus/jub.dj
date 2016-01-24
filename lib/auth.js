var RandBytes = new require('randbytes');
var crypto = require('crypto');
require('./logging')();

function Auth(config) {
  this.tokenLen =  config.auth.token_len
}

// sha256, returned in base64
Auth.prototype.encodeToken = function(token) {
  var shasum = crypto.createHash('sha256');
  shasum.update(token);
  return shasum.digest('base64');
}

// bytes from /dev/urandom/ --> base64 --> [0..len]
Auth.prototype.genToken = function(callback) {
  if(process.platform !== 'win32') {
    var randomSource = RandBytes.urandom.getInstance();

    randomSource.getRandomBytes( this.tokenLen, function( buff ) {
      var token = buff.toString( 'hex', 0, this.tokenLen );
      callback( token );
    }.bind(this) );
  }
}

// singleton
module.exports = function(config) {
  return new Auth(config);
}
