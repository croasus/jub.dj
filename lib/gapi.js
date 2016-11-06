// Good docs here:
//   https://developers.google.com/youtube/v3/docs/#resource-types
require('./logging')();

function GAPI(config) {
  let apiKey = config.google_api_server_key;
  let cxId = config.google_api_cx_id;
  let google = require('googleapis');
  let moment  = require('moment');
  let youtube = google.youtube('v3');
  let cse = google.customsearch('v1');
  let urlsh = google.urlshortener('v1');
  let gapi = this;

  // Perform an image search
  this.imageSearch = function(query, callback) {
    console.log('fetching image results for', query);
    let params = {
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
    gapi.imageSearch(query, items => {
      callback(items[0].link);
    });
  }

  // Takes in a URL (string), calls CB with a short URL (string)
  this.shortenUrl = function(longUrl, callback) {
    let params = {
      resource: { longUrl: longUrl },
      key: apiKey
    }

    urlsh.url.insert(params, (err, resp) => {
      if (err) console.error(err);
      if (resp && resp.id) {
        callback(resp.id);
      }
    });
  }

  this.videoSearch = function(query, callback) {
    let params = {
      part: 'snippet',
      maxResults: 50,
      order: 'viewCount',
      q: query,
      type: 'video',
      auth: apiKey
    };

    // Returns an array of result items with this structure:
    //   https://developers.google.com/youtube/v3/docs/search/list#response
    youtube.search.list(params, (err, resp) => {
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
       let params = {
        part: 'snippet,contentDetails',
        id: [obj.id],
        auth: apiKey
      };

      // Returns an array of result items with this structure:
      //   https://developers.google.com/youtube/v3/docs/search/list#response
      youtube.videos.list(params, (err, resp) => {
        if (resp && resp.items && resp.items.length > 0) {
          let duration = resp.items[0].contentDetails.duration;
          obj.duration = moment.duration(duration).asMilliseconds();
          obj.title = resp.items[0].snippet.title;
        }
        callback(obj);
      });
    }
  }

  // Pass in a playlist ID, get back a list of video objects
  this.playlist = function(id, callback, pageToken, listPrefix) {
    let params = {
      part: 'id,snippet',
      maxResults: 50,      // this is the maximum allowed
      playlistId: id,
      auth: apiKey
    };

    listPrefix = listPrefix || [];
    if (pageToken) { params.pageToken = pageToken }

    // Returns an array of result items with this structure:
    //   https://developers.google.com/youtube/v3/docs/search/list#response
    youtube.playlistItems.list(params, (err, resp) => {
      if (err) {
        console.log(err)
      } else {
        let nextPageToken = resp.nextPageToken;
        if (resp && resp.items && resp.items.length > 0) {
          let videoList = resp.items.map(item => {
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
