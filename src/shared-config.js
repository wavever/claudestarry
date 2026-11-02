// Lightweight shared-galaxy helpers with no supabase-js dependency, so the
// entry screen can use them without pulling the full client into first paint.

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

/**
 * Total number of shared stars, from a single HEAD request that returns only
 * PostgREST's exact count (no rows). Resolves to null on any failure; the full
 * sync still provides the count later.
 */
export async function fetchSharedStarCount(config, { fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  if (!config || typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl(`${config.url}/rest/v1/stars?select=id`, {
      method: 'HEAD',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!response.ok && response.status !== 206) return null;
    // e.g. "0-0/1234", or "*/0" for an empty table.
    const total = /\/(\d+)$/.exec(response.headers.get('content-range') || '')?.[1];
    return total === undefined ? null : Number(total);
  } catch {
    return null;
  }
}
