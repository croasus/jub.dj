var nock = require('nock');

nock('https://www.googleapis.com:443', {"encodedQueryParams":true})
  .post('/urlshortener/v1/url', {"longUrl":"http://www.facebook.com"})
  .query({"key":"AIzaSyAn4jI9fRs2i4A9Wvnfwx_XJ6m9rnUw4I0"})
  .reply(200, {"kind":"urlshortener#url","id":"http://goo.gl/mqaH","longUrl":"http://www.facebook.com/"}, { 'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
  pragma: 'no-cache',
  expires: 'Fri, 01 Jan 1990 00:00:00 GMT',
  date: 'Wed, 25 Nov 2015 03:13:01 GMT',
  vary: 'X-Origin, Origin,Accept-Encoding',
  'content-type': 'application/json; charset=UTF-8',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'x-xss-protection': '1; mode=block',
  server: 'GSE',
  'alternate-protocol': '443:quic,p=1',
  'alt-svc': 'quic=":443"; p="1"; ma=604800',
  'accept-ranges': 'none',
  connection: 'close' });
