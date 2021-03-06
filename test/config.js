module.exports = {
  title: 'thejub.pub',
  mongodb_endpoint: 'mongodb://localhost',
  mongodb_db: 'jub-dj-test',
  google_api_server_key: 'AIzaSyAn4jI9fRs2i4A9Wvnfwx_XJ6m9rnUw4I0',
  google_api_browser_key: 'AIzaSyAn4jI9fRs2i4A9Wvnfwx_XJ6m9rnUw4I0',
  google_api_cx_id: '015617422038491686005:ibyzcnlnobg',
  auth: {
    token_len: '20',
    expiration_days: 3,
  },
  private_room: 'testroom',
  moved_message: "Ask for the new URL!",
  chat: {
    cache_dir: 'test/chat_cache',
    cache_limit: 1000,
  },
  mail: {
    host: 'fake.host',
  },

  // only used for test cases
  test: {
    user: {
      name: 'test_user',
      password: '9ogyrW94VyaxE77K',
      email: 'contact@thejub.pub',
    },
  }
}
