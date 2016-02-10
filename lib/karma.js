/*
 {
 'type': 'video',
 'value': 1,
 'recipient': 'aromatt',
 'giver': 'ankit',
 'context': 'oKDU+/kd9',
 'timestamp': Date.now()
 }
*/
exports.giveVideoKarma = function(recipient, giver, videoId, callback) {
    callback({
        type: 'video',
        value: 1,
        recipient: recipient,
        giver: giver,
        context: videoId,
        timestamp: Date.now()
    });
};
function getKarma( user, callback ) {

}
function giveChatKarma( karma, recipient, giver, callback ) {
    callback({
        type: 'comment',
        value: karma,
        recipient: recipient,
        giver: giver,
        context: null,
        timestamp: Date.now()
    });
}

function normalizePPandMM( text ) {
    //++ or -- in the middle? return
    if( /.*[^\+\-\s]+[\+\-]+[^\+\-\s]+/.test( text ) ) {
        return null;
    }
    var user = text.replace(/[\-\+]/g,'');
    if( !user ) {
        return null;
    }
    var karmas = text.split( user );
    var karma = 0;
    karmas.forEach( function( karmaString ) {
        if( !karmaString) return;
        //hack to not have to check for "is last + or -" in loop
        karmaString = karmaString + '0';
        var count = 0;
        var chars = karmaString.split('');
        var state = chars[0];
        chars.forEach( function( char) {
            if( char === state ) { count++; }
            else {
                if( ! (count % 2) ) {
                    if( state === '-') {karma -= count /2;}
                    else if( state === '+' ) {karma += count /2;}
                }
                state = char;
                count = 1;
            }
        });
    });
    return { recipient: user.replace( /[\(\)]/g,''), karma: karma };
}

function doKarma( message, giver, callback ) {
    var foundKarma = false;
    message.split(/([\+\-]*\(.+?\)[\+\-]*|\S*)\s*/).forEach( function( text ) {
        if( text[0] !== '`' && (text.indexOf( '++' ) !== -1 || text.indexOf('--') !== -1 ) ) {
            var result = normalizePPandMM( text );
            if( result !== null ) {
                foundKarma = true;
                if( result.karma === 0 ) {
                    //no op karma, ++ was equal to --
                    return;
                }
                giveChatKarma( result.karma, result.recipient, giver, callback );
            }
        }
    });
    return foundKarma;
}

exports.parseComment = function(query, giver, callback) {
    if( query.indexOf( '!karma' ) === 0 ) {
        var person = query.replace( '!karma','') || giver;
        if( person[0] === ' ') {
            person = person.replace( /\s/,'');//only the first one if up front
        }
        var karma = getKarma( person, callback );
        return true;
    } else {
        return doKarma( query, giver, callback );
    }
};