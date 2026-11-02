import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedAccountCount } from './account-count.js';
import { fetchSharedStarCount } from './shared-config.js';

test('counter never counts up page by page or drops below the early total while syncing', () => {
  assert.equal(displayedAccountCount({ loaded: 0, early: 2400, synced: false }), 2400);
  assert.equal(displayedAccountCount({ loaded: 1000, early: 2400, synced: false }), 2400);
  // A star added during the sync can push past the early total.
  assert.equal(displayedAccountCount({ loaded: 2401, early: 2400, synced: false }), 2401);
  // Once synced, the loaded records are the truth (e.g. invalid rows filtered out).
  assert.equal(displayedAccountCount({ loaded: 2398, early: 2400, synced: true }), 2398);
});

test('counter stays hidden rather than showing a misleading zero', () => {
  assert.equal(displayedAccountCount({ loaded: 0, early: null, synced: false }), null);
  assert.equal(displayedAccountCount({ loaded: 12, early: null, synced: false }), 12);
  assert.equal(displayedAccountCount({ loaded: 0, synced: true }), 0);
});

test('early shared count reads the exact total from a HEAD request', async () => {
  const config = { url: 'https://example.supabase.co', anonKey: 'anon' };
  let request;
  const respond = (status, range) => async (url, init) => {
    request = { url, init };
    return { ok: status < 300, status, headers: new Map([['content-range', range]]) };
  };
  assert.equal(await fetchSharedStarCount(config, { fetchImpl: respond(206, '0-0/2400') }), 2400);
  assert.equal(request.url, 'https://example.supabase.co/rest/v1/stars?select=id');
  assert.equal(request.init.method, 'HEAD');
  assert.equal(request.init.headers.Prefer, 'count=exact');
  assert.equal(await fetchSharedStarCount(config, { fetchImpl: respond(200, '*/0') }), 0);
  assert.equal(await fetchSharedStarCount(config, { fetchImpl: respond(500, '') }), null);
  assert.equal(await fetchSharedStarCount(config, { fetchImpl: async () => { throw new Error('offline'); } }), null);
  assert.equal(await fetchSharedStarCount(null), null);
});
