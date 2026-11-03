import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWN_IDS_STORAGE_KEY,
  canAddAccountOwner,
  loadOwnIds,
  nextOwnStarIndex,
  ownStarIndices,
  rememberOwnId,
} from './own-stars.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('own IDs survive a new session and ignore malformed stored values', () => {
  const saved = storage({ [OWN_IDS_STORAGE_KEY]: JSON.stringify(['mine-a', '', 4, 'mine-a', 'mine-b']) });
  const ownIds = loadOwnIds(saved);
  assert.deepEqual([...ownIds], ['mine-a', 'mine-b']);
  assert.equal(rememberOwnId(ownIds, 'mine-c', saved), true);
  assert.deepEqual([...loadOwnIds(saved)], ['mine-a', 'mine-b', 'mine-c']);

  const broken = storage({ [OWN_IDS_STORAGE_KEY]: '{not JSON' });
  assert.deepEqual([...loadOwnIds(broken)], []);
});

test('only an own star with missing attribution offers the add-owner action', () => {
  const options = { ownIds: new Set(['mine', 'filled']) };
  assert.equal(canAddAccountOwner({ id: 'mine' }, options), true);
  assert.equal(canAddAccountOwner({ id: 'mine', owner: null }, options), true);
  assert.equal(canAddAccountOwner({ id: 'filled', owner: 'Alex' }, options), false);
  assert.equal(canAddAccountOwner({ id: 'someone-else' }, options), false);
  assert.equal(canAddAccountOwner(null, options), false);
  assert.equal(canAddAccountOwner({ id: 'MY-legacy' }, { includeLocalMyStars: true }), true);
});

test('cycling only uses visible current-user stars and wraps from the active card', () => {
  const accounts = [
    { id: 'remote' },
    { id: 'mine-a' },
    { id: 'deleted-from-list' },
    { id: 'mine-b' },
  ];
  const options = { ownIds: new Set(['mine-a', 'mine-b', 'unknown-stale-id']) };
  assert.deepEqual(ownStarIndices(accounts, options), [1, 3]);
  assert.equal(nextOwnStarIndex(accounts, null, options), 1);
  assert.equal(nextOwnStarIndex(accounts, 'mine-a', options), 3);
  assert.equal(nextOwnStarIndex(accounts, 'mine-b', options), 1);
  assert.equal(nextOwnStarIndex(accounts, 'unknown-stale-id', options), 1);
  assert.equal(nextOwnStarIndex([{ id: 'remote' }], 'mine-a', options), -1);
});

test('shared-session ownership and legacy local-only MY records both participate', () => {
  const accounts = [{ id: 'MY-local' }, { id: 'shared-mine' }, { id: 'remote' }];
  assert.deepEqual(
    ownStarIndices(accounts, { sessionOwnIds: new Set(['shared-mine']) }),
    [1],
  );
  assert.deepEqual(
    ownStarIndices(accounts, { includeLocalMyStars: true }),
    [0],
  );
});
