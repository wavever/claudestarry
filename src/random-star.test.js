import test from 'node:test';
import assert from 'node:assert/strict';
import { drawRandomStar } from './random-star.js';

const sky = ids => ids.map(id => ({ id }));
const others = (mine = new Set()) => account => !mine.has(account.id);
const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('visits every other star once before repeating, never the current one', () => {
  const accounts = sky(['mine', 'a', 'b', 'c', 'd']);
  const bag = [];
  const isEligible = others(new Set(['mine']));
  let currentId = null;
  const round = [];
  for (let i = 0; i < 4; i++) {
    const index = drawRandomStar(accounts, bag, { isEligible, currentId, random: seeded(7) });
    assert.notEqual(accounts[index].id, currentId);
    currentId = accounts[index].id;
    round.push(currentId);
  }
  assert.deepEqual([...round].sort(), ['a', 'b', 'c', 'd']);
  // The next round starts without repeating the star that is still open.
  const next = drawRandomStar(accounts, bag, { isEligible, currentId, random: seeded(7) });
  assert.notEqual(accounts[next].id, currentId);
  assert.notEqual(accounts[next].id, 'mine');
});

test('skips stars removed or hidden since they were bagged, using current indices', () => {
  const bag = ['gone', 'b', 'hidden'];
  const accounts = sky(['b', 'hidden', 'a']);
  const isEligible = account => account.id !== 'hidden';
  assert.equal(drawRandomStar(accounts, bag, { isEligible }), 0);
  assert.deepEqual(bag, ['gone']);
});

test('reopens the only candidate, and reports none when nothing is eligible', () => {
  const accounts = sky(['mine', 'only']);
  const isEligible = others(new Set(['mine']));
  assert.equal(drawRandomStar(accounts, [], { isEligible, currentId: 'only' }), 1);
  assert.equal(drawRandomStar(sky(['mine']), [], { isEligible }), -1);
  assert.equal(drawRandomStar([], [], { isEligible }), -1);
});
