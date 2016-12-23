let RandBytes = new require('randbytes');
let crypto = require('crypto');
let bcrypt = require('bcrypt');
require('./logging')();

function Auth(config) {
  this.tokenLen =  config.auth.token_len || 32;
  this.HMACSecretLen =  config.auth.hmac_secret_len || 32;
  let auth = this;

  let TOKEN_DELIMITER = ':';
  let TOKEN_DATA_DELIMITER = ',';

  this.hashPassword = function(plain, callback, errCb) {
    if (typeof errCb !==  'function') {
      errCb = function(err) { console.error(err); };
    }
    bcrypt.genSalt(10, (err, salt) => {
      if (err) { return errCb(err); }
      bcrypt.hash(plain, salt, (err, hash) => {
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

  // sha256, returned in `encoding`
  this.sha256 = function(parts, encoding) {
    if (encoding === undefined) { encoding = 'base64'; }

    let shasum = crypto.createHash('sha256');
    parts.forEach(part => {
      shasum.update(part);
    })
    return shasum.digest(encoding);
  };

  // bytes from /dev/urandom/ --> hex [0..len]
  this.genPasswordResetToken = function(callback) {
    if (process.platform !== 'win32') {
      let randomSource = RandBytes.urandom.getInstance();
      randomSource.getRandomBytes(64, buff => {
        let secret = auth.sha256([buff], 'hex');
        callback(secret);
      });
    }
    else {
      let secret = "shhh";
      callback(secret);
    }
  };

  this.createSessionDigest = function(expiration, data, secret) {
    return auth.sha256([expiration.toString(), data, secret], 'hex');
  };

  this.parseToken = function(token) {
    // TODO clean up with destructuring
    if (!token) { return null; }
    let [expstr, data, digest] = token.split(TOKEN_DELIMITER);
    let expiration = parseInt(expstr, 10);
    let [userKind, username] = data.split(TOKEN_DATA_DELIMITER);
    return {
      digest: digest,
      data: data,
      username: username,
      userKind: userKind,
      expiration: expiration
    };
  }

  // https://pdos.csail.mit.edu/papers/webauth:sec10.pdf
  this.createSessionToken = function(expiration, data, secret, callback) {
    let token = expiration;
    token += TOKEN_DELIMITER + data;
    token += TOKEN_DELIMITER + auth.createSessionDigest(expiration, data, secret);
    callback(token);
  };

  // To be valid, the digest must be correct and the token must not be expired
  this.validateSessionToken = function(candidate, secret, callback) {
    if (!candidate) { return callback(false); }
    let content = auth.parseToken(candidate);
    let correctDigest = auth.createSessionDigest(content.expiration, content.data, secret);
    let valid = (content.digest === correctDigest) &&
                (content.expiration > (new Date()).getTime());
    callback(valid);
  };

  // bytes from /dev/urandom/ --> SHA-256 --> base64
  this.genHMACSecret = function(callback) {
    if (process.platform !== 'win32') {
      let randomSource = RandBytes.urandom.getInstance();

      randomSource.getRandomBytes(64, buff => {
        let secret = auth.sha256([buff]);
        callback(secret);
      });
    }
    else {
      let secret = "shhh";
      callback(secret);
    }
  };
}

// singleton
module.exports = function(config) {
  return new Auth(config);
}
