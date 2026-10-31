import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_STORAGE_KEY,
  applyDocumentLocale,
  localeFromSearch,
  localeSearchWithSelection,
  missingTranslationKeys,
  persistLocale,
  resolveLocale,
  safeStorage,
  sloganForLocale,
  translate,
} from './i18n.js';
import {defaultConfigForLocale,localizeDefaultSlogan} from './config.js';
import {dateToDay,mergeAccounts} from './model.js';
import {normalizeStarSubmission} from './shared-stars.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('locale resolution honors an explicit URL or saved choice before browser languages', () => {
  const saved = storage({ [LOCALE_STORAGE_KEY]: 'en' });
  assert.equal(resolveLocale({ search: '?locale=zh-CN', storage: saved, languages: ['en-US'] }), 'zh-CN');
  assert.equal(resolveLocale({ storage: saved, languages: ['zh-CN'] }), 'en');
  assert.equal(localeFromSearch('?lang=en-GB'), 'en');
  assert.equal(localeFromSearch('?locale=unsupported'), null);
});

test('browser language preference order preserves Chinese and English users', () => {
  assert.equal(resolveLocale({ languages: ['en-US', 'zh-CN'] }), 'en');
  assert.equal(resolveLocale({ languages: ['zh-CN', 'en-US'] }), 'zh-CN');
  assert.equal(resolveLocale({ languages: ['fr-FR'] }), 'en');
});

test('an explicit locale choice persists safely and affects the default intro slogan', () => {
  const saved = storage();
  assert.equal(persistLocale(saved, 'en-US'), true);
  assert.equal(saved.getItem(LOCALE_STORAGE_KEY), 'en');
  assert.equal(resolveLocale({ storage: saved, languages: ['zh-CN'] }), 'en');
  assert.equal(persistLocale(saved, 'unsupported'), false);
  assert.equal(defaultConfigForLocale('en').slogan, sloganForLocale('en'));
  assert.equal(localizeDefaultSlogan(sloganForLocale('zh-CN'), 'en'), sloganForLocale('en'));
  assert.equal(localizeDefaultSlogan('A custom remembered line', 'zh-CN'), 'A custom remembered line');
  assert.equal(localeSearchWithSelection('?lang=en&view=galaxy', 'zh-CN'), '?lang=zh-CN&view=galaxy');
  assert.equal(localeSearchWithSelection('?locale=en&lang=en', 'zh-CN'), '?locale=zh-CN&lang=zh-CN');
  assert.equal(localeSearchWithSelection('?view=galaxy', 'zh-CN'), '?view=galaxy');
});

test('production slogans follow the selected locale even with a remembered custom debug slogan', () => {
  const staleSlogan = '你的 Claude 账号没有消失，只是从此不再回应，但仍留有余光';
  const english = localizeDefaultSlogan(staleSlogan, 'en', false);
  assert.equal(english, sloganForLocale('en'));
  assert.doesNotMatch(english, /[\u3400-\u9fff]/u);
  assert.equal(localizeDefaultSlogan(english, 'zh-CN', false), sloganForLocale('zh-CN'));
  assert.equal(localizeDefaultSlogan(staleSlogan, 'en', true), staleSlogan);
});

test('translations interpolate values, fall back predictably, and stay key-complete', () => {
  assert.equal(translate('en', 'counter.aria', { count: 12 }), '12 disabled accounts recorded');
  assert.equal(translate('en', 'counter.ariaOne', { count: 1 }), '1 disabled account recorded');
  assert.equal(translate('zh-CN', 'card.disabledOn', { date: '2026 / 10 / 31' }), '停用于 2026 / 10 / 31');
  assert.equal(translate('unsupported', 'controls.create'), '添加星星');
  assert.deepEqual(missingTranslationKeys(), { 'zh-CN': [], en: [] });
});

test('storage access failures fall back safely and document localization marks the active locale', () => {
  assert.equal(safeStorage(() => { throw new Error('blocked'); }), null);
  assert.equal(resolveLocale({ storage: safeStorage(() => { throw new Error('blocked'); }), languages: ['zh-CN'] }), 'zh-CN');
  const attributes = [{}, {}];
  const buttons = ['zh-CN', 'en'].map((locale, index) => ({
    dataset: { locale },
    setAttribute: (key, value) => { attributes[index][key] = value; },
  }));
  const root = {
    documentElement: {},
    querySelectorAll: selector => selector === '[data-locale]' ? buttons : [],
  };
  applyDocumentLocale('en', root);
  assert.equal(root.documentElement.lang, 'en');
  assert.deepEqual(attributes, [{ 'aria-pressed': 'false' }, { 'aria-pressed': 'true' }]);
});

test('locale operations never alter validated or shared account data', () => {
  const input = {
    id: 'MY-00000000-0000-4000-8000-000000000123',
    alias: '一颗星 / one star',
    started: '2021-01-26',
    date: '2026-10-30',
    message: '原始故事 remains exactly as submitted.',
  };
  const before = structuredClone(input);
  const zhRecord = mergeAccounts([], [input], dateToDay('2026-10-31'))[0];
  translate('zh-CN', 'share.tweet', { url: 'https://example.test/' });
  translate('en', 'share.tweet', { url: 'https://example.test/' });
  const enRecord = mergeAccounts([], [input], dateToDay('2026-10-31'))[0];
  assert.deepEqual(input, before);
  assert.deepEqual(enRecord, zhRecord);
  assert.deepEqual(
    normalizeStarSubmission(input, '2026-10-31'),
    { id: input.id, alias: input.alias, started: input.started, date: input.date, message: input.message },
  );
});
