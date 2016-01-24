# thejub.pub
chat + shared video

[![Build Status](https://travis-ci.org/aromatt/thejub.pub.svg)](https://travis-ci.org/aromatt/thejub.pub)

![thejub.pub screenshot](/public/images/thejub.pub.png)

## Setup
1. Clone this repo
2. Install node.js + npm
 * http://www.sitepoint.com/beginners-guide-node-package-manager/
 * Make sure the version of node.js you install meets the `"engines"` requirement in `package.json`.
3. Install the dependencies. From the project directory: `$ npm install --loglevel verbose`
4. Copy the example `config.js` under `example/` to the root level: `$ cp example/config.js config.js`

5. Get YouTube developer keys (you'll have to get one for server and one for browser) and replace `google_api_server_key` and `google_api_browser_key` with the ones provided by Google.

## Running the server
The server can be started with the following command:
```
$ TEST=1 npm start
```
Then visit `http://localhost:3000/ROUTE` in your browser, where `ROUTE` is the value of `"private_route"` in `config.js`. You can specify a different port number using the `PORT` environment variable.

## Testing
Tests are slowly being added. To run the regression tests:

```
$ npm test
```

To add a new test, add a script to the `regress/` directory and run

```
# Unix-like
$ TEST=1 ./test/baseline -b

# Windows or Unix-like
$ TEST=1 node test/baseline.js -b
```

Make sure no other tests' baselines changed -- if they did, verify that the
new behavior is correct. Once you're confident your new test is working,
commit the test script and its baseline.

## Known issues
Internet Explorer is currently not supported.
