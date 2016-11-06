/*
 {
 'type': 'video',
 'value': 1,
 'recipient': 'aromatt',
 'giver': 'ankit',
 'context': 'oKDU+/kd9',
 'givenAt': Date.now()
 }
*/
function giveChatKarma(karma, recipient, giver, callback) {
    callback({
        type: 'comment',
        value: karma,
        recipient: recipient,
        giver: giver,
        context: null,
        givenAt: Date.now()
    });
}

function normalizePPandMM(text) {
    // ++ or -- in the middle? return
    if (/.*[^\+\-\s]+[\+\-]+[^\+\-\s]+/.test(text)) {
        return null;
    }
    let user = text.replace(/[\-\+]/g,'');
    if (!user) {
        return null;
    }
    let karmas = text.split(user);
    let karma = 0;
    karmas.forEach(karmaString => {
        if (!karmaString) return;
        // hack to not have to check for "is last + or -" in loop
        karmaString = karmaString + '0';
        let chars = karmaString.split('');
        let state = chars[0];
        let count = 0;
        chars.forEach(char => {
            if (char === state) { count++; }
            else {
                if (!(count % 2)) {
                    if (state === '-') { karma -= count / 2; }
                    else if (state === '+') { karma += count / 2; }
                }
                state = char;
                count = 1;
            }
        });
    });
    return { recipient: user.replace(/[\(\)]/g,''), karma: karma };
}

// Respond to '!karma' with the user's karma.
exports.parseForReport = function(query, asker, callback) {
    if (query.indexOf('!karma') === 0) {
        let person = query.replace('!karma', '') || asker;
        if (person[0] === ' ') { person = person.trim(); }
        callback(person);
    }
}

// Look for karma-giving and act accordingly
exports.parseForGive = function(query, giver, callback) {
    let foundKarma = false;
    let filter = function(text) {
      return text[0] !== '`'  &&
        (text.indexOf('++') !== -1 ||
         text.indexOf('--') !== -1);
    };
    let karmaRegex = /([\+\-]*\(.+?\)[\+\-]*|\S*)\s*/;
    query.split(karmaRegex).forEach(text => {
        if (filter(text)) {
            let result = normalizePPandMM(text);
            if (result !== null) {
                foundKarma = true;
                if (result.karma === 0) {
                    // no op karma, ++ was equal to --
                    return;
                }
                giveChatKarma(result.karma, result.recipient, giver, callback);
            }
        }
    });
};

exports.giveVideoKarma = function(recipient, giver, videoId, callback) {
    callback({
        type: 'video',
        value: 1,
        recipient: recipient,
        giver: giver,
        context: videoId,
        givenAt: Date.now()
    });
};
