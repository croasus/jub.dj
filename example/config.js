module.exports = {
  title: 'thejub.pub',
  mongodb_endpoint: 'mongodb://localhost',
  mongodb_db: 'jub-dj-dev',

  // If you start the server with env TEST=1, the server key will be used
  // by both the server and the browser.
  google_api_server_key: 'GOOGLE-SERVER-KEY-HERE', // get your own key
  google_api_browser_key: 'GOOGLE-BROWSER-KEY-HERE', // get your own key

  // https://cse.google.com/
  google_api_cx_id: 'GOOGLE-CSE-CX-ID-HERE', // get your own key
  auth: {
    token_len: '20'
  },
  latest_updates: {
    date: '2015-11-6',
    list: [
      'A cool update',
      'A lame update'
    ]
  },
  private_route: '/test_private_route',
  moved_message: "This is a message telling users how to find out what the private route is.",
  chat: {
    cache_dir: './chat_cache',
    cache_limit: 1000,
  }
};
