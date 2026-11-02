import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTOR_RING_RADIUS, cardConnector, connectorPathData, shareConnector } from './connector.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('card thread starts on the ring around the star, not on the particle', () => {
  const desktop = cardConnector({ mobile: false, sx: 400, sy: 300, targetX: 900, targetY: 260 });
  assert.ok(Math.abs(distance(desktop.start, desktop.center) - CONNECTOR_RING_RADIUS) < 1e-9);
  assert.deepEqual(desktop.center, { x: 400, y: 300 });
  // Leaves horizontally toward the card on desktop.
  assert.equal(desktop.start.y, 300);
  assert.ok(desktop.start.x > 400);

  const mobile = cardConnector({ mobile: true, sx: 180, sy: 200, targetX: 200, targetY: 520 });
  assert.equal(mobile.start.x, 180);
  assert.equal(mobile.start.y, 200 + CONNECTOR_RING_RADIUS);
  assert.match(connectorPathData(mobile), /^M 180 210 C /);
});

test('share thread ends on the card edge facing the star and skips hidden stars', () => {
  const right = shareConnector({ star: { x: 700, y: 300, visible: true }, side: 'right', x: 1000, y: 120, w: 260, h: 180 });
  assert.deepEqual(right.end, { x: 1000, y: 276 });
  assert.ok(Math.abs(distance(right.start, right.center) - CONNECTOR_RING_RADIUS) < 1e-9);
  const left = shareConnector({ star: { x: 700, y: 300, visible: true }, side: 'left', x: 16, y: 280, w: 260, h: 180 });
  assert.equal(left.end.x, 276);
  assert.equal(shareConnector({ star: { x: 1, y: 1, visible: false }, side: 'left', x: 0, y: 0, w: 10, h: 10 }), null);
});

test('no thread when the card edge is inside the ring', () => {
  assert.equal(cardConnector({ mobile: false, sx: 400, sy: 300, targetX: 412, targetY: 304 }), null);
  assert.equal(connectorPathData(null), '');
});
