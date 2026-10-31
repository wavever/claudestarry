import test from 'node:test';
import assert from 'node:assert/strict';
import {formatStarCoordinates} from './share.js';

test('share coordinates preserve stable nebula values and never invent a zero location', () => {
  assert.equal(formatStarCoordinates([-3.01, 2.77, 0.4]), '(-3.01, +2.77, +0.40)');
  assert.equal(formatStarCoordinates(new Float32Array([1, -2, 3])), '(+1.00, -2.00, +3.00)');
  assert.equal(formatStarCoordinates(), '');
  assert.equal(formatStarCoordinates([1, Number.NaN, 3]), '');
});
