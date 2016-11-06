module.exports = {
  title: 'thejub.pub',
  mongodb_endpoint: 'mongodb://localhost',
  mongodb_db: 'jub-dj-test',
  google_api_server_key: 'AIzaSyAn4jI9fRs2i4A9Wvnfwx_XJ6m9rnUw4I0',
  google_api_browser_key: 'AIzaSyAn4jI9fRs2i4A9Wvnfwx_XJ6m9rnUw4I0',
  google_api_cx_id: '015617422038491686005:ibyzcnlnobg',
  auth: {
    token_len: '20'
  },
  private_room: 'test_private_route',
  moved_message: "Ask for the new URL!",
  chat: {
    cache_dir: 'test/chat_cache',
    cache_limit: 1000,
  },
  mail: {
    host: 'fake.host',
  }
}
