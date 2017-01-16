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
$ TEST=1 JUB_CONFIG=test/config.js npm start
```
Then visit `http://localhost:3000/ROUTE` in your browser, where `ROUTE` is the value of `"private_route"` in `config.js`. You can specify a different port number using the `PORT` environment variable.

## Testing
Tests are slowly being added. To run them:

```
$ npm test
```
There are two sets of tests: server (unit/functional) tests and UI (integration/end-to-end) tests.

### Adding a UI test
The UI tests use Selenium via Nightwatch. See the tests in `test/ui/`.

The quickest way to iterate is to start the Selenium server manually and then run only your test case, instead of the entire test suite:

    # In one shell:
    $ ./test/bin/start-selenium

    # In another shell:
    $ ./test/bin/run-ui-test YOUR_UI_TEST

### Adding a library test
To add a new test, add a script to the `test/server/` directory. It should be a node.js script, and should output something meaningful (i.e., so that if the relevant feature broke, your test's output would change).

While developing your test, make sure to run your script with environment variable `TEST=1`.

Once your test is producing the correct output, run the baseline tool to create its baseline file:

```
$ node test/bin/baseline.js -b YOUR_TEST
```

Next, run the baseline tool with no arguments to make sure the other server tests still pass. If any of the tests fail, it means their output has changed. If in fact their new output is now correct, then rewrite their baselines (using `-b` as above). Don't forget to commit your new test and its baseline.

## Known issues
Internet Explorer is currently not supported.
