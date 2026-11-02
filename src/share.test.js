import test from 'node:test';
import assert from 'node:assert/strict';
import {formatStarCoordinates, shareCountText} from './share.js';

test('share caption splits the total into own accounts and companions', () => {
  assert.equal(shareCountText({ ownCount: 2, totalCount: 30, locale: 'zh-CN' }), '您的 2 个 claude 停用账号将和其他 28 个伙伴一起，点亮这片星云');
  assert.equal(shareCountText({ ownCount: 0, totalCount: 30, locale: 'zh-CN' }), '当前已有 30 个 claude 停用账号在星云中');
  assert.equal(shareCountText({ ownCount: 3, totalCount: 3, locale: 'zh-CN' }), '您的 3 个 claude 停用账号将和其他 0 个伙伴一起，点亮这片星云');
  assert.equal(shareCountText({ ownCount: 2, totalCount: 30, locale: 'en' }), 'Your 2 disabled Claude accounts will light up this nebula together with 28 other companions');
  assert.equal(shareCountText({ ownCount: 1, totalCount: 2, locale: 'en' }), 'Your 1 disabled Claude account will light up this nebula together with 1 other companion');
  assert.equal(shareCountText({ ownCount: 0, totalCount: 1, locale: 'en' }), 'The nebula now holds 1 disabled Claude account');
  assert.equal(shareCountText({ ownCount: 1200, totalCount: 11400, locale: 'en', format: n => n.toLocaleString('en-US') }), 'Your 1,200 disabled Claude accounts will light up this nebula together with 10,200 other companions');
  // Never claim more own stars than exist in the total.
  assert.equal(shareCountText({ ownCount: 5, totalCount: 3, locale: 'zh-CN' }), '您的 3 个 claude 停用账号将和其他 0 个伙伴一起，点亮这片星云');
});

test('share coordinates preserve stable nebula values and never invent a zero location', () => {
  assert.equal(formatStarCoordinates([-3.01, 2.77, 0.4]), '(-3.01, +2.77, +0.40)');
  assert.equal(formatStarCoordinates(new Float32Array([1, -2, 3])), '(+1.00, -2.00, +3.00)');
  assert.equal(formatStarCoordinates(), '');
  assert.equal(formatStarCoordinates([1, Number.NaN, 3]), '');
});
