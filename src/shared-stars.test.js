import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_STAR_RECONCILE_OVERLAP_MS,
  SharedStarsClient,
  mergeSharedStars,
  newestRecentStar,
  normalizeSharedStar,
  normalizeStarSubmission,
} from './shared-stars.js';

const id = suffix => `MY-00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = Date.parse('2026-10-31T12:00:00.000Z');
const row = (number, suffix, createdAt = new Date(at).toISOString()) => ({
  id: id(suffix), catalog_number: number, alias: `Star ${number}`, started: null,
  date: '2020-01-02', message: `message ${number}`, created_at: createdAt,
});

function fakeSupabase(pages = [[]], gteCalls = []) {
  let page = 0;
  return {
    from() {
      const query = {
        select() { return this; }, order() { return this; }, range() { return this; },
        gte(_column, value) { gteCalls.push(value); return this; },
        then(resolve, reject) { return Promise.resolve({ data: pages[page++] || [], error: null }).then(resolve, reject); },
      };
      return query;
    },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel: async () => {},
  };
}

function controlledSupabase(responses = []) {
  let queryCount = 0;
  const channels = [];
  return {
    channels,
    get queryCount() { return queryCount; },
    supabase: {
      from() {
        const query = {
          select() { return this; }, order() { return this; }, range() { return this; }, gte() { return this; },
          then(resolve, reject) {
            queryCount++;
            return Promise.resolve(responses.shift() || { data: [], error: null }).then(resolve, reject);
          },
        };
        return query;
      },
      channel() {
        const channel = {
          on(_event, _filter, handler) { this.eventHandler = handler; return this; },
          subscribe(handler) { this.statusHandler = handler; return this; },
        };
        channels.push(channel);
        return channel;
      },
      removeChannel: async channel => { channel.removed = true; },
    },
  };
}

const nextTurn = () => new Promise(resolve => setTimeout(resolve, 0));

test('shared records deduplicate by stable ID, preserve catalog order, and accept Unicode-sized text', () => {
  const emoji = '✨'.repeat(32);
  const first = { ...row(2, 2), alias: emoji };
  assert.equal(normalizeSharedStar(first)?.alias, emoji);
  const result = mergeSharedStars([row(3, 3)], [first, { ...first, message: 'updated' }, row(1, 1)]);
  assert.deepEqual(result.records.map(star => star.catalogNumber), [1, 2, 3]);
  assert.equal(result.records.find(star => star.id === first.id).message, 'updated');
  assert.equal(result.added.length, 2);
  assert.equal(result.changed.length, 1);
});

test('only a recent newest record is eligible for a reconnect meteor', () => {
  const recent = { ...normalizeSharedStar(row(2, 2, new Date(at - 4000).toISOString())) };
  const older = { ...normalizeSharedStar(row(1, 1, new Date(at - 180000).toISOString())) };
  assert.equal(newestRecentStar([older, recent], at)?.id, recent.id);
  assert.equal(newestRecentStar([older], at), null);
});

test('shared client suppresses its own realtime echo and queries a deduplicated reconnect overlap', async () => {
  const gteCalls = [];
  const supabase = fakeSupabase([[row(1, 1)]], gteCalls);
  const remote = [];
  const client = new SharedStarsClient({ url: 'https://example.supabase.co', anonKey: 'anon' }, {
    createClientImpl: () => supabase,
    isVisible: () => true,
    now: () => at,
    onRemoteStar: star => remote.push(star.id),
  });
  client.hydrated = true;
  client.rememberOwn(id(1));
  client.handleRealtime({ eventType: 'INSERT', new: row(1, 1) });
  client.handleRealtime({ eventType: 'INSERT', new: row(2, 2, new Date(at - 1000).toISOString()) });
  assert.deepEqual(remote, [id(2)]);
  client.latestChangedAtMs = at;
  client.latestChangedAt = new Date(at).toISOString();
  await client.reconcile({ initial: false });
  assert.equal(gteCalls[0], new Date(at - SHARED_STAR_RECONCILE_OVERLAP_MS).toISOString());
});

test('submission validation keeps the same MY UUID and permits up to 32 Unicode aliases', () => {
  const submission = normalizeStarSubmission({
    id: id(9), alias: '✨'.repeat(32), started: '', date: '2022-01-02', message: 'A safe message',
  }, '2022-01-02');
  assert.equal(submission?.id, id(9));
  assert.equal(normalizeStarSubmission({ ...submission, date: '2021-01-25' }, '2022-01-02'), null);
  assert.equal(submission?.alias, '✨'.repeat(32));
  assert.equal(normalizeStarSubmission({ ...submission, date: '2022-01-03' }, '2022-01-02'), null);
});

test('a record without an optional story survives submission and shared hydration', () => {
  const submission = normalizeStarSubmission({
    id: id(10), alias: 'No story', started: '', date: '2026-01-02', message: '',
  }, '2026-01-02');
  assert.equal(submission?.message, '');
  const hydrated = normalizeSharedStar({
    ...submission, catalog_number: 10, created_at: '2026-01-02T12:00:00Z',
  });
  assert.equal(hydrated?.message, '');
  assert.equal(hydrated?.alias, 'No story');
});

test('stopping before a delayed subscription resolves cannot hydrate or resurrect the socket', async () => {
  const controlled = controlledSupabase([{ data: [row(1, 1)], error: null }]);
  const records = [];
  const client = new SharedStarsClient({ url: 'https://example.supabase.co', anonKey: 'anon' }, {
    createClientImpl: () => controlled.supabase,
    isVisible: () => true,
    onRecords: value => records.push(value),
  });

  const starting = client.start();
  const channel = controlled.channels[0];
  client.stop();
  channel.statusHandler('SUBSCRIBED');
  await starting;

  assert.equal(controlled.queryCount, 0);
  assert.equal(client.socketLive, false);
  assert.equal(client.hydrated, false);
  assert.equal(client.channel, null);
  assert.deepEqual(records, []);
});

test('a visibility restart ignores stale channel callbacks and reruns an interrupted hydration', async () => {
  let visible = true;
  let resolveFirstPage;
  const firstPage = new Promise(resolve => { resolveFirstPage = resolve; });
  const controlled = controlledSupabase([
    firstPage,
    { data: [row(1, 1)], error: null },
  ]);
  const records = [];
  const remote = [];
  const client = new SharedStarsClient({ url: 'https://example.supabase.co', anonKey: 'anon' }, {
    createClientImpl: () => controlled.supabase,
    isVisible: () => visible,
    onRecords: value => records.push(value),
    onRemoteStar: value => remote.push(value.id),
  });

  const initialStart = client.start();
  const firstChannel = controlled.channels[0];
  firstChannel.statusHandler('SUBSCRIBED');
  await nextTurn();
  assert.equal(controlled.queryCount, 1);

  visible = false;
  await client.handleVisibility();
  resolveFirstPage({ data: [row(2, 2)], error: null });
  await initialStart;

  assert.equal(client.hydrated, false);
  assert.deepEqual(records, []);

  visible = true;
  const restarting = client.handleVisibility();
  const secondChannel = controlled.channels[1];
  firstChannel.eventHandler({ eventType: 'INSERT', new: row(3, 3) });
  firstChannel.statusHandler('SUBSCRIBED');
  secondChannel.statusHandler('SUBSCRIBED');
  await restarting;

  assert.equal(controlled.queryCount, 2);
  assert.equal(client.channel, secondChannel);
  assert.equal(client.socketLive, true);
  assert.equal(client.hydrated, true);
  assert.deepEqual(client.listRecords().map(star => star.catalogNumber), [1]);
  assert.equal(records.length, 1);
  assert.deepEqual(remote, []);
});

test('a failed subscription handshake hydrates through HTTP and recovers on a later socket reconnect', async () => {
  const controlled = controlledSupabase([
    { data: [row(1, 1)], error: null },
    { data: [row(1, 1)], error: null },
  ]);
  const client = new SharedStarsClient({ url: 'https://example.supabase.co', anonKey: 'anon' }, {
    createClientImpl: () => controlled.supabase,
    isVisible: () => true,
  });

  const starting = client.start();
  const channel = controlled.channels[0];
  channel.statusHandler('CHANNEL_ERROR');
  await starting;

  assert.equal(client.hydrated, true);
  assert.equal(client.socketLive, false);
  assert.equal(controlled.queryCount, 1);
  assert.notEqual(client.fallbackTimer, null);

  channel.statusHandler('SUBSCRIBED');
  await nextTurn();

  assert.equal(client.socketLive, true);
  assert.equal(client.fallbackTimer, null);
  assert.equal(controlled.queryCount, 2);
  client.stop();
});


test('optional owner normalizes and updates by stable ID without replaying a meteor', async () => {
  assert.equal(normalizeSharedStar(row(1, 1)).owner, null);
  assert.equal(normalizeSharedStar({ ...row(1, 1), owner_name: '  小明  ' }).owner, '小明');
  assert.equal(normalizeSharedStar({ ...row(1, 1), owner_name: 'x'.repeat(33) }), null);
  assert.equal(normalizeStarSubmission({ id: id(1), alias: 'A', date: '2026-01-02', owner: 42 }), null);
  const changedRow = { ...row(1, 1), owner_name: 'Alex', updated_at: new Date(at + 5000).toISOString() };
  const meteors = [], records = [];
  const client = new SharedStarsClient({ url: 'https://example.supabase.co', anonKey: 'anon' }, {
    createClientImpl: () => fakeSupabase(),
    onRemoteStar: value => meteors.push(value), onRecords: value => records.push(value),
    fetchImpl: async (url, init) => {
      assert.equal(url, '/api/stars/owner');
      assert.deepEqual(JSON.parse(init.body), { id: id(1), owner: 'Alex' });
      return Response.json({ star: changedRow });
    },
  });
  client.hydrated = true;
  client.ingest([row(1, 1)]);
  const saved = await client.addOwner(id(1), ' Alex ');
  assert.equal(saved.owner, 'Alex');
  assert.equal(client.listRecords().length, 1);
  assert.equal(client.latestChangedAtMs, at + 5000);
  assert.equal(records.at(-1)[0].owner, 'Alex');
  assert.deepEqual(meteors, []);
  client.fetchImpl = async () => Response.json({}, { status: 403 });
  await assert.rejects(client.addOwner(id(1), 'Alex'), error => error.status === 403);
  assert.equal(client.listRecords()[0].owner, 'Alex');
});

test('reconciliation uses update time to retrieve an owner added to an older star', async () => {
  const calls = [];
  const updated = { ...row(1, 1, '2020-01-02T00:00:00Z'), owner_name: '小明', updated_at: new Date(at + 5000).toISOString() };
  const client = new SharedStarsClient({ url: 'https://example.supabase.co', anonKey: 'anon' }, {
    createClientImpl: () => ({
      from() {
        const query = { select(){return this;}, order(){return this;}, range(){return this;},
          gte(column, since) { calls.push({column,since}); return this; },
          then(resolve) { return Promise.resolve({data:[updated],error:null}).then(resolve); } };
        return query;
      },
    }),
  });
  client.ingest([row(1, 1, '2020-01-02T00:00:00Z')]);
  client.hydrated = true;
  client.latestChangedAtMs = at;
  await client.reconcile();
  assert.equal(calls[0].column, 'updated_at');
  assert.equal(client.listRecords()[0].owner, '小明');
  assert.equal(client.latestChangedAtMs, at + 5000);
});
