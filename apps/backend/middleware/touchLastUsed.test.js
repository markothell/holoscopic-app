const test = require('node:test');
const assert = require('node:assert');
const { appFor } = require('./touchLastUsed');

test('an app token names its own app on any route', () => {
  assert.equal(appFor({ authedAud: 'circles', originalUrl: '/api/threshold/seeds/x' }), 'circles');
  assert.equal(appFor({ authedAud: 'spectrum', originalUrl: '/api/oas/me/games' }), 'spectrum');
});

test('a holoscopic.io token counts as interView only on interView routes', () => {
  assert.equal(appFor({ authedAud: 'interview', originalUrl: '/api/topics?x=1' }), 'interview');
  assert.equal(appFor({ authedAud: 'interview', originalUrl: '/api/activities/abc/entry' }), 'interview');
  // The dashboard and the homepage mint the same audience.
  assert.equal(appFor({ authedAud: 'interview', originalUrl: '/api/me/dashboard' }), null);
  // The user menu's balance read runs on every page of the site.
  assert.equal(appFor({ authedAud: 'interview', originalUrl: '/api/holons/balance' }), null);
  assert.equal(appFor({ authedAud: 'interview', originalUrl: '/api/activities-archive' }), null);
});

test('no audience, no app', () => {
  assert.equal(appFor({ originalUrl: '/api/topics' }), null);
});
