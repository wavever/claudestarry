import test from 'node:test';
import assert from 'node:assert/strict';
import {createCardsPageShare, formatStarCoordinates, shareCountText, shareSloganLayout} from './share.js';
import {sloganForLocale} from './i18n.js';

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

test('exported cards preserve attribution and always include the complete quoted slogan', async t => {
  const drawn = [];
  const context = new Proxy({
    measureText: value => ({ width: Array.from(value).length * 6 }),
    fillText: (value, x, y) => drawn.push({ value, x, y, font: context.font }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ getContext: () => context, toBlob: callback => callback(new Blob(['png'])) }),
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  const account = { id: 'mine', catalogNumber: 1, alias: 'Star', date: '2026-01-02', message: 'A story' };
  for (const [locale, expected] of [['zh-CN', '由 小明 珍藏'], ['en', 'Kept by 小明']]) {
    drawn.length = 0;
    await createCardsPageShare({ cards: [{ x: 700, y: 180, w: 280, h: 300, account: { ...account, owner: '小明' } }], locale });
    const cardText = drawn.filter(item => item.x >= 700 * (1600 / 1200) && item.y < 480 * (1600 / 1200));
    assert.equal(cardText.at(-1).value, expected);
  }
  drawn.length = 0;
  await createCardsPageShare({ cards: [{ x: 700, y: 180, w: 280, h: 300, account }], locale: 'en' });
  const cardText = drawn.filter(item => item.x >= 700 * (1600 / 1200) && item.y < 480 * (1600 / 1200));
  assert.equal(cardText.at(-1).value, 'A story');
  for (const viewport of [{ width: 1200, height: 800 }, { width: 390, height: 844 }]) {
    for (const locale of ['zh-CN', 'en']) {
      for (const cards of [[], [{ x: 700, y: 180, w: 280, h: 300, account }]]) {
        drawn.length = 0;
        await createCardsPageShare({ cards, locale, viewport });
        const scale = Math.max(1, Math.min(2, 1600 / viewport.width));
        const layout = shareSloganLayout(context, sloganForLocale(locale), {
          scale, width: viewport.width * scale, height: viewport.height * scale,
        });
        const sloganText = drawn.filter(item => item.x === layout.textX);
        assert.equal(sloganText.map(item => item.value).join('').replace(/\s/g, ''), sloganForLocale(locale).replace(/\s/g, ''));
        assert.equal(drawn.filter(item => item.value === '“').length, 1);
        assert.equal(drawn.filter(item => item.value === '”').length, 1);
        const quote = drawn.find(item => item.value === '“');
        assert.ok(parseFloat(quote.font.match(/([\d.]+)px/)[1]) > layout.fontSize);
        assert.ok(layout.top > viewport.height * scale * .5);
      }
    }
  }
});

test('share coordinates preserve stable nebula values and never invent a zero location', () => {
  assert.equal(formatStarCoordinates([-3.01, 2.77, 0.4]), '(-3.01, +2.77, +0.40)');
  assert.equal(formatStarCoordinates(new Float32Array([1, -2, 3])), '(+1.00, -2.00, +3.00)');
  assert.equal(formatStarCoordinates(), '');
  assert.equal(formatStarCoordinates([1, Number.NaN, 3]), '');
});
