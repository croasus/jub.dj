var SMTPConnection = require('smtp-connection');
require('./logging')();

function Mail(config) {

  var options = {
    host: config.mail.host,
    port: 25,
    requireTLS: true,
  };

  function createMessage(from, subject, content) {
    var msg = "From: thejub.pub <" + from + ">\n";
    msg += "Subject: " + subject + "\n";
    msg += "\n";
    msg += content;
    return msg;
  }

  this.send = function(to, subject, message) {
    if (process.env.TEST) {
      return console.log("TEST mode; would have sent email:",
                         to, subject, message);
    }
    var connection = new SMTPConnection(options);
    console.log("attempting smtp connection");
    connection.connect(function(err) {
      console.log("smtp connection established");
      connection.login(config.mail.auth, function(err) {
        if (err) {
          connection.quit();
          return console.error(err);
        }
        console.log("smtp authentication successful");
        var from = config.mail.senders.contact;
        var msg = createMessage(from, subject, message);
        var envelope = { to: to, from: from };
        connection.send(envelope, msg, function(err, info) {
          if (err) {
            connection.quit();
            return console.error(err);
          }
          console.log("smtp message sent", info);
          connection.quit();
        });
      });
    });
  };
};

module.exports = function(config) {
  return new Mail(config);
}
