import { createClient } from '@supabase/supabase-js';
import { CLAUDE_EPOCH, dateToDay, validAccount } from './model.js';

export const SHARED_STAR_PAGE_SIZE = 1000;
export const SHARED_STAR_SELECT = 'id,catalog_number,alias,started,date,message,created_at';
export const SHARED_STAR_RECONCILE_OVERLAP_MS = 60000;
const ID_RE = /^MY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_ERROR_MESSAGES = Object.freeze({
  sharedSync: '共享星河暂时无法同步。',
  invalidSubmission: '请检查日期和填写内容。',
  connection: '无法连接共享星河。',
  wait: '请稍候再送入另一颗星。',
  sharedSave: '暂时无法保存，请检查填写内容后重试。',
  sharedUnavailable: '共享星河暂时无法保存。',
  invalidRecord: '共享星河返回了无效记录。',
});

export const latestCivilDate = () => new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
const textLength = value => Array.from(value).length;

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanText(value, max, { empty = false, multiline = false } = {}) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').trim();
  const forbidden = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  return forbidden.test(text) || textLength(text) > max || (!empty && !text) ? null : text;
}

export function getSharedStarsConfig(env) {
  const url = typeof env?.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim().replace(/\/+$/, '') : '';
  const anonKey = typeof env?.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
  } catch { return null; }
  return { url, anonKey };
}

export function normalizeSharedStar(row, maxDay = dateToDay(latestCivilDate())) {
  if (!row || typeof row !== 'object') return null;
  const catalogNumber = Number(row.catalog_number ?? row.catalogNumber);
  const started = row.started === null || row.started === '' || row.started === undefined ? null : row.started;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : row.createdAt;
  const account = {
    id: row.id,
    catalogNumber,
    alias: cleanText(row.alias, 32),
    started,
    date: row.date,
    message: cleanText(row.message ?? '', 180, { empty: true, multiline: true }) ?? '',
    createdAt,
  };
  if (!ID_RE.test(account.id || '') || !Number.isSafeInteger(catalogNumber) || catalogNumber < 1 || !isDate(account.date) || (started !== null && !isDate(started)) || !Number.isFinite(Date.parse(createdAt))) return null;
  return validAccount(account, maxDay, null) ? account : null;
}

const sameRecord = (a, b) => a.id === b.id && a.catalogNumber === b.catalogNumber && a.alias === b.alias &&
  a.started === b.started && a.date === b.date && a.message === b.message && a.createdAt === b.createdAt;

export const sortSharedStars = records => [...records].sort((a, b) => a.catalogNumber - b.catalogNumber || a.id.localeCompare(b.id));

export function mergeSharedStars(existing, incoming) {
  const byId = new Map();
  for (const row of existing || []) {
    const record = normalizeSharedStar(row);
    if (record) byId.set(record.id, record);
  }
  const added = [], changed = [];
  for (const row of incoming || []) {
    const record = normalizeSharedStar(row);
    if (!record) continue;
    const previous = byId.get(record.id);
    if (!previous) added.push(record);
    else if (!sameRecord(previous, record)) changed.push(record);
    byId.set(record.id, record);
  }
  return { records: sortSharedStars([...byId.values()]), added: sortSharedStars(added), changed: sortSharedStars(changed) };
}

export function newestRecentStar(records, now = Date.now(), maxAgeMs = 120000) {
  return [...records]
    .filter(record => {
      const age = now - Date.parse(record.createdAt);
      return Number.isFinite(age) && age >= -30000 && age <= maxAgeMs;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.catalogNumber - a.catalogNumber)[0] || null;
}

export function normalizeStarSubmission(input, maxDate = latestCivilDate(), minDate = CLAUDE_EPOCH) {
  const alias = cleanText(input?.alias ?? '', 32, { empty: true });
  const message = cleanText(input?.message ?? '', 180, { empty: true, multiline: true });
  const started = input?.started === '' || input?.started === null || input?.started === undefined ? null : input?.started;
  if (!ID_RE.test(input?.id || '') || alias === null || message === null || !isDate(input?.date) || (started !== null && !isDate(started))) return null;
  if (input.date > maxDate || (minDate && input.date < minDate)) return null;
  if (started && (started > input.date || (minDate && started < minDate))) return null;
  return { id: input.id, alias, started, date: input.date, message };
}

export class SharedStarsError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'SharedStarsError'; this.status = status; }
}

export class SharedStarsClient {
  constructor(config, options = {}) {
    this.onRecords = options.onRecords || (() => {});
    this.onRemoteStar = options.onRemoteStar || (() => {});
    this.onError = options.onError || (() => {});
    this.now = options.now || (() => Date.now());
    this.isVisible = options.isVisible || (() => typeof document === 'undefined' || !document.hidden);
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.message = typeof options.message === 'function' ? options.message : key => DEFAULT_ERROR_MESSAGES[key] || DEFAULT_ERROR_MESSAGES.sharedUnavailable;
    const buildClient = options.createClientImpl || createClient;
    this.client = buildClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 2 } },
    });
    this.recordsById = new Map(); this.ownIds = new Set();
    this.latestCreatedAt = null; this.latestCreatedAtMs = -Infinity;
    this.channel = null; this.channelGeneration = null; this.socketLive = false; this.running = false; this.hydrated = false; this.paused = false;
    this.lifecycle = 0;
    this.fallbackTimer = null; this.syncPromise = null; this.syncGeneration = null;
    this.visibilityHandler = () => this.handleVisibility();
  }

  listRecords() { return sortSharedStars([...this.recordsById.values()]); }
  error(key, status = 0) { return new SharedStarsError(this.message(key), status); }
  rememberOwn(id) {
    this.ownIds.add(id);
    while (this.ownIds.size > 128) this.ownIds.delete(this.ownIds.values().next().value);
  }

  async start() {
    if (this.running) return;
    this.running = true; this.paused = false;
    const generation = ++this.lifecycle;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visibilityHandler);
    if (!this.isVisible()) { this.paused = true; return; }
    await this.activate({ initial: true, animateNewest: false, generation });
  }

  stop() {
    this.lifecycle++;
    this.running = false; this.paused = false; this.clearFallback();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    void this.disconnectRealtime();
  }

  async handleVisibility() {
    if (!this.running) return;
    if (!this.isVisible()) {
      this.paused = true; this.lifecycle++; this.clearFallback(); await this.disconnectRealtime(); return;
    }
    this.paused = false;
    const generation = ++this.lifecycle;
    await this.activate({ initial: !this.hydrated, animateNewest: this.hydrated, generation });
  }

  isActive(generation) {
    return generation === this.lifecycle && this.running && !this.paused && this.isVisible();
  }

  isCurrentChannel(channel, generation) {
    return this.isActive(generation) && this.channel === channel && this.channelGeneration === generation;
  }

  isCurrentGeneration(generation) {
    return generation === null || this.isActive(generation);
  }

  async activate({ initial, animateNewest, generation = this.lifecycle }) {
    if (!this.isActive(generation)) return;
    await this.connectRealtime(generation); // subscription-first: stream starts before paged reconciliation
    if (!this.isActive(generation)) return;
    try {
      await this.reconcile({ initial, animateNewest, generation });
      if (!this.isActive(generation)) return;
      this.hydrated = true;
    } catch {
      if (!this.isActive(generation)) return;
      this.onError(this.error('sharedSync'));
    }
    if (!this.isActive(generation)) return;
    if (!this.socketLive || !this.hydrated) this.scheduleFallback(generation);
  }

  async connectRealtime(generation = this.lifecycle) {
    if (!this.isActive(generation)) return false;
    if (this.channel) {
      if (this.channelGeneration === generation) return this.socketLive;
      void this.disconnectRealtime();
    }
    let resolveStatus, settled = false;
    const ready = new Promise(resolve => { resolveStatus = resolve; });
    const finish = value => { if (!settled) { settled = true; resolveStatus(value); } };
    let channel;
    try {
      channel = this.client.channel('afterlight-stars');
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'stars' }, event => {
        if (!this.isCurrentChannel(channel, generation)) return;
        this.handleRealtime(event);
      });
      this.channel = channel;
      this.channelGeneration = generation;
      channel.subscribe(status => {
        if (!this.isCurrentChannel(channel, generation)) { finish(false); return; }
        if (status === 'SUBSCRIBED') {
          const hadOutage = this.hydrated && !this.socketLive;
          this.socketLive = true; this.clearFallback(); finish(true);
          if (hadOutage) {
            void this.reconcile({ initial: false, animateNewest: true, generation }).catch(() => {
              if (this.isCurrentChannel(channel, generation)) this.scheduleFallback(generation);
            });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.socketLive = false; finish(false);
          if (this.hydrated) this.scheduleFallback(generation);
        }
      });
    } catch {
      if (this.channel === channel) {
        this.channel = null;
        this.channelGeneration = null;
      }
      return false;
    }
    const timeout = setTimeout(() => finish(false), 4500);
    const result = await ready;
    clearTimeout(timeout);
    return this.isCurrentChannel(channel, generation) ? result : false;
  }

  async disconnectRealtime() {
    this.socketLive = false;
    if (!this.channel) return;
    const channel = this.channel; this.channel = null; this.channelGeneration = null;
    try { await this.client.removeChannel(channel); } catch {}
  }

  scheduleFallback(generation = this.lifecycle) {
    if (this.fallbackTimer || !this.isActive(generation)) return;
    this.fallbackTimer = setTimeout(async () => {
      this.fallbackTimer = null;
      if (!this.isActive(generation) || (this.socketLive && this.hydrated)) return;
      const initial = !this.hydrated;
      try {
        await this.reconcile({ initial, animateNewest: this.hydrated, generation });
        if (!this.isActive(generation)) return;
        this.hydrated = true;
      } catch {
        if (!this.isActive(generation)) return;
        this.onError(this.error('sharedSync'));
      }
      if (this.isActive(generation)) this.scheduleFallback(generation);
    }, 60000);
  }

  clearFallback() { if (this.fallbackTimer) clearTimeout(this.fallbackTimer); this.fallbackTimer = null; }

  async reconcile({ initial = false, animateNewest = false, generation = null } = {}) {
    if (!this.isCurrentGeneration(generation)) return [];
    if (this.syncPromise && this.syncGeneration === generation) return this.syncPromise;
    // PostgreSQL now() is transaction-start time. A small overlap covers a
    // delayed commit after reconnect; stable IDs deduplicate it for free.
    const since = initial || !this.hydrated || !Number.isFinite(this.latestCreatedAtMs)
      ? null
      : new Date(Math.max(0, this.latestCreatedAtMs - SHARED_STAR_RECONCILE_OVERLAP_MS)).toISOString();
    const sync = this.fetchPages(since, generation).then(added => {
      if (!this.isCurrentGeneration(generation)) return [];
      if (!initial && animateNewest) this.emitNewestRemote(added);
      return added;
    }).finally(() => {
      if (this.syncPromise === sync) {
        this.syncPromise = null;
        this.syncGeneration = null;
      }
    });
    this.syncGeneration = generation;
    this.syncPromise = sync;
    return sync;
  }

  async fetchPages(since, generation = null) {
    const added = [];
    for (let offset = 0; ; offset += SHARED_STAR_PAGE_SIZE) {
      if (!this.isCurrentGeneration(generation)) return [];
      let query = this.client.from('stars').select(SHARED_STAR_SELECT)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + SHARED_STAR_PAGE_SIZE - 1);
      if (since) query = query.gte('created_at', since);
      const { data, error } = await query;
      if (!this.isCurrentGeneration(generation)) return [];
      if (error) throw this.error('sharedSync');
      const page = Array.isArray(data) ? data : [];
      const result = this.ingest(page);
      added.push(...result.added);
      if (result.changed) this.emitRecords();
      if (page.length < SHARED_STAR_PAGE_SIZE) return added;
    }
  }

  ingest(rows) {
    const added = []; let changed = false;
    for (const row of rows || []) {
      const record = normalizeSharedStar(row); if (!record) continue;
      const previous = this.recordsById.get(record.id);
      if (!previous) added.push(record);
      if (!previous || !sameRecord(previous, record)) { this.recordsById.set(record.id, record); changed = true; }
      const timestamp = Date.parse(record.createdAt);
      if (timestamp > this.latestCreatedAtMs) { this.latestCreatedAtMs = timestamp; this.latestCreatedAt = record.createdAt; }
    }
    return { added, changed };
  }

  emitRecords() { this.onRecords(this.listRecords()); }
  emitNewestRemote(records) {
    const newest = newestRecentStar(records.filter(record => !this.ownIds.has(record.id)), this.now());
    if (newest && this.isVisible()) this.onRemoteStar(newest);
  }
  handleRealtime(event) {
    if (!event?.new || (event.eventType !== 'INSERT' && event.eventType !== 'UPDATE')) return;
    const result = this.ingest([event.new]);
    if (result.changed) this.emitRecords();
    if (this.hydrated) this.emitNewestRemote(result.added);
  }

  async submit(input) {
    const submission = normalizeStarSubmission(input);
    if (!submission) throw this.error('invalidSubmission', 400);
    this.rememberOwn(submission.id);
    if (!this.fetchImpl) throw this.error('connection');
    let response, body;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await this.fetchImpl('/api/stars', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submission) });
        try { body = await response.json(); } catch { body = null; }
      } catch {
        if (attempt === 0) continue;
        throw this.error('connection');
      }
      if (response.ok) break;
      if (response.status >= 500 && attempt === 0) continue; // same ID makes a retry safe
      if (response.status === 429) throw this.error('wait', 429);
      throw this.error('sharedSave', response.status);
    }
    if (!response?.ok) throw this.error('sharedUnavailable', response?.status || 0);
    const record = normalizeSharedStar(body?.star);
    if (!record) throw this.error('invalidRecord');
    const result = this.ingest([record]);
    if (result.changed) this.emitRecords();
    return record;
  }
}
