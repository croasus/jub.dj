// Good docs here:
//   https://developers.google.com/youtube/v3/docs/#resource-types
require('./logging')();

function GAPI(config) {
  var apiKey = config.google_api_server_key;
  var cxId = config.google_api_cx_id;
  var google = require('googleapis');
  var moment  = require('moment');
  var youtube = google.youtube('v3');
  var cse = google.customsearch('v1');
  var urlsh = google.urlshortener('v1');
  var gapi = this;

  // Perform an image search
  this.imageSearch = function(query, callback) {
    console.log('fetching image results for', query);
    var params = {
      q: query,
      cx: cxId,
      searchType: 'image',
      key: apiKey,
      safe: 'off'
    };

    // Returns an array of result items with this structure:
    //   https://developers.google.com/custom-search/json-api/v1/reference/cse/list#response
    cse.cse.list(params, function(err, resp) {
      if (err) console.error(err);
      if (resp && resp.items) {
        callback(resp.items);
      }
    });
  }

  this.oneImageLink = function(query, callback) {
    gapi.imageSearch(query, function(items) {
      callback(items[0].link);
    });
  }

  // Takes in a URL (string), calls CB with a short URL (string)
  this.shortenUrl = function(longUrl, callback) {
    var params = {
      resource: { longUrl: longUrl },
      key: apiKey
    }

    urlsh.url.insert(params, function(err, resp) {
      if (err) console.error(err);
      if (resp && resp.id) {
        callback(resp.id);
      }
    });
  }

  this.videoSearch = function(query, callback) {
    var params = {
      part: 'snippet',
      maxResults: 50,
      order: 'viewCount',
      q: query,
      type: 'video',
      auth: apiKey
    };

    // Returns an array of result items with this structure:
    //   https://developers.google.com/youtube/v3/docs/search/list#response
    youtube.search.list(params, function(err, resp) {
      if (err) console.error('youtube search error', err);
      if (resp && resp.items) {
        callback(resp.items);
      }
    });
  };

  // Adds title and duration to video object, and calls callback with it
  this.videoSpecs = function(obj, callback) {
    if (obj.duration && obj.title) {
      callback(obj)
    } else {
       var params = {
        part: 'snippet,contentDetails',
        id: [obj.id],
        auth: apiKey
      };

      // Returns an array of result items with this structure:
      //   https://developers.google.com/youtube/v3/docs/search/list#response
      youtube.videos.list(params, function(err, resp) {
        if (resp && resp.items && resp.items.length > 0) {
          var duration = resp.items[0].contentDetails.duration;
          obj.duration = moment.duration(duration).asMilliseconds();
          obj.title = resp.items[0].snippet.title;
        }
        callback(obj);
      });
    }
  }

  // Pass in a playlist ID, get back a list of video objects
  this.playlist = function(id, callback, pageToken, listPrefix) {
    var params = {
      part: 'id,snippet',
      maxResults: 50,      // this is the maximum allowed
      playlistId: id,
      auth: apiKey
    };

    listPrefix = listPrefix || [];
    if (pageToken) { params.pageToken = pageToken }

    // Returns an array of result items with this structure:
    //   https://developers.google.com/youtube/v3/docs/search/list#response
    youtube.playlistItems.list(params, function(err, resp) {
      if (err) {
        console.log(err)
      } else {
        var nextPageToken = resp.nextPageToken;
        if (resp && resp.items && resp.items.length > 0) {
          var videoList = resp.items.map(function(item) {
            return { title: item.snippet.title,
              id: item.snippet.resourceId.videoId,
              position: item.snippet.position
            }
          });

          // If there's a next page, recursively call playlist() until there's
          // no next page. Each invocation calls the callback with a separate
          // chunk of items
          if (nextPageToken) {
            console.log('fetching next page of playlist', nextPageToken);
            youtube.playlist(id, callback, nextPageToken,
                             listPrefix.concat(videoList));
          } else {
            callback(listPrefix.concat(videoList));
          }
        }
      }
    });
  };
}

module.exports = function(config) {
  return new GAPI(config);
}
