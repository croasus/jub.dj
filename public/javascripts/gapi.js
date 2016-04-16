var gapiReady = false;

var OnGAPILoad = function() {
  socket.emit('gapi key', function(key) {
    console.log('setting key', key);
    gapiKey = key;
    gapi.client.setApiKey(key);
    gapi.client.load('youtube', 'v3').then(function() {
      gapiReady = true;
    });
  });
}

var youtubeVideoSearch = function(query, callback) {
  gapi.client.youtube.search.list({
      part: 'snippet',
      maxResults: 50,
      order: 'viewCount',
      q: query,
      type: 'video'
  }).then(function(resp) {
    callback(resp.result.items);
  });
}

// Adds title and duration to video object, and calls callback with it
var youtubeVideoSpecs = function(obj, callback) {
  if (obj.duration && obj.title) {
    callback(obj)
  } else {

    // Returns an array of result items with this structure:
    //   https://developers.google.com/youtube/v3/docs/search/list#response
    gapi.client.youtube.videos.list({
      part: 'snippet,contentDetails',
      id: [obj.id]
    }).then(function(resp) {
      if (resp.result && resp.result.items && resp.result.items.length > 0) {
        var duration = resp.result.items[0].contentDetails.duration;
        obj.duration = moment.duration(duration).asMilliseconds();
        obj.title = resp.result.items[0].snippet.title;
      }
      callback(obj);
    }, function(reason) {
      callback({});
    });
  }
}

// Returns an array of result items with this structure:
//   https://developers.google.com/youtube/v3/docs/search/list#response
var youtubePlaylist = function(id, callback, pageToken, listPrefix) {
  var params = {
    part: 'id,snippet',
    maxResults: 50,      // this is the maximum allowed
    playlistId: id,
    auth: gapiKey
  };

  listPrefix = listPrefix || [];
  if (pageToken) { params.pageToken = pageToken }

  gapi.client.youtube.playlistItems.list(params).then(function(resp) {
    var nextPageToken = resp.result.nextPageToken;
    if (resp.result && resp.result.items && resp.result.items.length > 0) {
      var videoList = resp.result.items.map(function(item) {
        return {
          title: item.snippet.title,
          id: item.snippet.resourceId.videoId,
          position: item.snippet.position
        }
      });

      // If there's a next page, recursively call playlist() until there's
      // no next page. Then finally call the callback
      if (nextPageToken) {
        console.log('fetching next page of playlist', nextPageToken);
        youtubePlaylist(id, callback, nextPageToken,
          listPrefix.concat(videoList));
      } else {
        callback(listPrefix.concat(videoList));
      }
    }
  }, function(reason) {
    callback([]);
  });
}
