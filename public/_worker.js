// Cloudflare Pages advanced-mode Worker. Vite copies this self-contained file
// from public/ to dist/; keep every secret in Pages environment variables.

const API_PATH = '/api/stars';
const MAX_BODY_BYTES = 2048;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://claudestarry.pages.dev',
  'http://127.0.0.1:4317',
  'http://localhost:4317',
]);
const ID_RE = /^MY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Keep this transport boundary in sync with CLAUDE_EPOCH in src/model.js and
// the stars_supported_dates constraint in the Supabase migration.
export const MIN_ACCOUNT_DATE = '2021-01-26';
const TEXT_ENCODER = new TextEncoder();

function json(body, status = 200, origin = null, headers = {}) {
  const responseHeaders = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  if (origin) {
    responseHeaders.set('access-control-allow-origin', origin);
    responseHeaders.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function allowedOrigins(env) {
  const extra = typeof env?.ALLOWED_ORIGINS === 'string'
    ? env.ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean)
    : [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

export function isAllowedOrigin(origin, env) {
  return typeof origin === 'string' && allowedOrigins(env).has(origin);
}

function withCorsHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

function characterLength(value) { return Array.from(value).length; }

function normalizeText(value, { max, allowEmpty = false, multiline = false }) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  const forbidden = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (forbidden.test(normalized) || characterLength(normalized) > max || (!allowEmpty && !normalized)) return null;
  return normalized;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// UTC+14 is the latest civil day currently observed anywhere; this avoids
// rejecting a visitor's legitimate local "today" while still rejecting future dates.
export function latestCivilDate() {
  return new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function validateSubmission(input, maxDate = latestCivilDate(), minDate = MIN_ACCOUNT_DATE) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const permitted = new Set(['id', 'alias', 'started', 'date', 'message']);
  if (Object.keys(input).some(key => !permitted.has(key))) return null;
  if (typeof input.id !== 'string' || !ID_RE.test(input.id)) return null;
  const alias = normalizeText(input.alias ?? '', { max: 32, allowEmpty: true, multiline: false });
  const message = normalizeText(input.message ?? '', { max: 180, allowEmpty: true, multiline: true });
  const started = input.started === '' || input.started === null || input.started === undefined ? null : input.started;
  if (alias === null || message === null || !isCalendarDate(input.date)) return null;
  if (started !== null && !isCalendarDate(started)) return null;
  if (input.date > maxDate || (minDate && input.date < minDate)) return null;
  if (started && (started > input.date || (minDate && started < minDate))) return null;
  return { id: input.id, alias, started, date: input.date, message };
}

export async function fingerprintIp(ip, salt) {
  const key = await crypto.subtle.importKey(
    'raw', TEXT_ENCODER.encode(`afterlight-ip-v1:${salt}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(ip));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function parseJson(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  try { return JSON.parse(text); } catch { return null; }
}

function configurationReady(env) {
  return Boolean(
    typeof env?.SUPABASE_URL === 'string' && env.SUPABASE_URL &&
    typeof env?.SUPABASE_SERVICE_ROLE_KEY === 'string' && env.SUPABASE_SERVICE_ROLE_KEY &&
    typeof env?.IP_HASH_SALT === 'string' && env.IP_HASH_SALT.length >= 16,
  );
}

function safeSupabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/, '') : null;
  } catch { return null; }
}

async function postStar({ submission, ipHash, env, fetchImpl }) {
  const baseUrl = safeSupabaseUrl(env.SUPABASE_URL);
  if (!baseUrl) return { kind: 'unavailable' };
  let response, timeout, signal;
  if (typeof AbortSignal.timeout === 'function') signal = AbortSignal.timeout(15000);
  else {
    const controller = new AbortController();
    signal = controller.signal;
    timeout = setTimeout(() => controller.abort(), 15000);
  }
  try {
    response = await fetchImpl(`${baseUrl}/rest/v1/rpc/create_star_submission`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify({
        p_id: submission.id, p_alias: submission.alias, p_started: submission.started,
        p_date: submission.date, p_message: submission.message, p_ip_hash: ipHash,
      }),
      signal,
    });
  } catch { return { kind: 'unavailable' }; }
  finally { if (timeout) clearTimeout(timeout); }
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (payload?.message === 'rate_limited') return { kind: 'rate_limited' };
    if (payload?.message === 'invalid_submission') return { kind: 'invalid' };
    return { kind: 'unavailable' };
  }
  const row = Array.isArray(payload) ? payload[0] : payload;
  return row && typeof row === 'object' ? { kind: 'ok', row } : { kind: 'unavailable' };
}

async function handleApi(request, env, fetchImpl) {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin, env)) return json({ error: 'Request origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return withCorsHeaders(new Response(null, { status: 204 }), origin);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin, { allow: 'POST, OPTIONS' });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Invalid star submission.' }, 415, origin);
  if (!configurationReady(env)) return json({ error: 'Unable to save this star right now.' }, 503, origin);
  const submission = validateSubmission(await parseJson(request));
  if (!submission) return json({ error: 'Invalid star submission.' }, 400, origin);
  // No raw address is persisted; only this server-side HMAC reaches the RPC.
  const ipHash = await fingerprintIp(request.headers.get('CF-Connecting-IP') || 'unavailable', env.IP_HASH_SALT);
  const result = await postStar({ submission, ipHash, env, fetchImpl });
  if (result.kind === 'rate_limited') return json({ error: 'Please wait before adding another star.' }, 429, origin, { 'retry-after': '10' });
  if (result.kind === 'invalid') return json({ error: 'Invalid star submission.' }, 400, origin);
  if (result.kind !== 'ok') return json({ error: 'Unable to save this star right now.' }, 503, origin);
  return json({ star: result.row }, 201, origin);
}

export function createWorker({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      if (new URL(request.url).pathname === API_PATH) return handleApi(request, env, fetchImpl);
      return env.ASSETS.fetch(request);
    },
  };
}

export default createWorker();
