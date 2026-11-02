// The top-left "N disabled accounts" line. Rendered first by the entry screen
// (from a quick count) and then kept up to date by the app.
import { translate } from './i18n.js';

/**
 * What the counter should show. Until the shared galaxy has fully synced,
 * the records loaded so far are only part of the sky, so never show fewer
 * than the early total — the number must not count up page by page or drop
 * back. Returns null while nothing trustworthy is known yet.
 */
export function displayedAccountCount({ loaded = 0, early = null, synced = true } = {}) {
  if (synced) return loaded;
  if (Number.isFinite(early)) return Math.max(loaded, early);
  return loaded > 0 ? loaded : null;
}

export function formatAccountCount(count, locale) {
  return new Intl.NumberFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US').format(count);
}

/** Writes the count into the existing counter markup and reveals the line. */
export function renderAccountCount(count, locale, root = document) {
  const line = root.querySelector('#account-counter');
  const value = root.querySelector('#counter-value');
  if (!line || !value || !Number.isFinite(count)) return;
  const t = (key, values) => translate(locale, key, values);
  const formatted = formatAccountCount(count, locale);
  const countKey = count === 1 ? 'One' : '';
  value.textContent = formatted;
  line.setAttribute('aria-label', t(`counter.aria${countKey}`, { count: formatted }));
  const suffix = root.querySelector('#account-counter-suffix');
  if (suffix) suffix.textContent = t(`counter.suffix${countKey}`);
  line.classList.remove('is-pending');
}
