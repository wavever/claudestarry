import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorker, fingerprintIp, MIN_ACCOUNT_DATE, validateSubmission } from '../public/_worker.js';

const id = 'MY-00000000-0000-4000-8000-000000000001';
const origin = 'https://claudestarry.pages.dev';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
  IP_HASH_SALT: 'a stable test salt that is long enough',
  ASSETS: { fetch: async () => new Response('asset') },
};
const body = { id, alias: '', started: null, date: '2022-01-02', message: 'A remembered light.' };

test('worker preserves an empty optional story through the write RPC', async () => {
  const worker = createWorker({ fetchImpl: async (_url, init) => {
    assert.equal(JSON.parse(init.body).p_message, '');
    return Response.json([{ ...body, message: '', catalog_number: 1, created_at: '2026-01-02T00:00:00Z' }]);
  } });
  const response = await worker.fetch(new Request('https://claudestarry.pages.dev/api/stars', {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify({ ...body, date: '2026-01-02', message: '' }),
  }), env);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).star.message, '');
});

test('worker validation rejects malformed/future submissions and hashes fingerprints deterministically', async () => {
  assert.equal(validateSubmission(body, '2022-01-02')?.id, id);
  assert.equal(validateSubmission({ ...body, started: MIN_ACCOUNT_DATE, date: MIN_ACCOUNT_DATE }, MIN_ACCOUNT_DATE)?.date, MIN_ACCOUNT_DATE);
  assert.equal(validateSubmission({ ...body, date: '2021-01-25' }, '2022-01-02'), null);
  assert.equal(validateSubmission({ ...body, started: '2021-01-25' }, '2022-01-02'), null);
  assert.equal(validateSubmission({ ...body, date: '2022-01-03' }, '2022-01-02'), null);
  assert.equal(validateSubmission({ ...body, alias: 'x'.repeat(33) }, '2022-01-02'), null);
  const first = await fingerprintIp('203.0.113.10', env.IP_HASH_SALT);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, await fingerprintIp('203.0.113.10', env.IP_HASH_SALT));
  assert.notEqual(first, await fingerprintIp('203.0.113.11', env.IP_HASH_SALT));
});

test('worker and migration share the supported-date floor while preserving old rows', async () => {
  assert.equal(MIN_ACCOUNT_DATE, '2021-01-26');
  const migration=await readFile(new URL('../supabase/migrations/20261031010000_submission_validation.sql', import.meta.url),'utf8');
  assert.match(migration,/check \(date >= date '2021-01-26' and \(started is null or started >= date '2021-01-26'\)\) not valid/i);
  assert.match(migration,/p_date < date '2021-01-26'/);
  assert.match(migration,/p_started is not null and p_started < date '2021-01-26'/);
});

test('worker sends only the RPC arguments, returns a sanitized record, and rejects a bad Origin', async () => {
  const calls = [];
  const worker = createWorker({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return Response.json([{ ...body, catalog_number: 7, created_at: '2022-01-02T00:00:00.000Z' }]);
  } });
  const request = new Request('https://claudestarry.pages.dev/api/stars', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify(body),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).star.catalog_number, 7);
  assert.equal(calls.length, 1);
  const rpc = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(rpc).sort(), ['p_alias', 'p_date', 'p_id', 'p_ip_hash', 'p_message', 'p_started']);
  assert.match(rpc.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.equal(calls[0].init.headers.authorization, 'Bearer service-secret');

  const forbidden = new Request('https://claudestarry.pages.dev/api/stars', {
    method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await worker.fetch(forbidden, env)).status, 403);
});

test('worker stream cap and upstream failures do not expose backend details', async () => {
  let called = false;
  const worker = createWorker({ fetchImpl: async () => { called = true; return Response.json({ message: 'database secret' }, { status: 500 }); } });
  const oversized = new Request('https://claudestarry.pages.dev/api/stars', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, message: 'x'.repeat(3000) }),
  });
  assert.equal((await worker.fetch(oversized, env)).status, 400);
  assert.equal(called, false);
  const response = await worker.fetch(new Request('https://claudestarry.pages.dev/api/stars', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env);
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await response.json()), /database secret/);
});
