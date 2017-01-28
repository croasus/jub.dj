let child_process = require('child_process');

function Imitater(config) {
  let imitater = this;

  this.markovPath = function(user) {
    return config.chat.markov_dir + '/' + user;
  }

  this.imitate = function(user, callback) {
    let p = child_process.spawn("markgen", [imitater.markovPath(user)]);
    p.stdout.on('data', chunk => {
      callback(botMsgObj(chunk.toString()));
    });
    p.stderr.on('data', chunk => {
      console.error("markgen error: " + chunk.toString());
    });
    p.on('error', (a, b) => {
      console.error("markgen exited: ", a, b);
    });
  }
}

module.exports = function(config) {
  return new Imitater(config);
};
