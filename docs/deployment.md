# Shared-star deployment

The production site is **claudestarry** at <https://claudestarry.pages.dev>. It
uses Supabase project `jykeprbzpbgghxkndqld` (Singapore free tier) and a
Cloudflare Pages direct upload. There is no Git-based deployment required.

## Browser configuration

Copy `.env.example` to `.env.production.local` on the machine that runs the
production build, and set only these public values:

```dotenv
VITE_SUPABASE_URL=https://jykeprbzpbgghxkndqld.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon key>
VITE_PUBLIC_SITE_URL=https://claudestarry.pages.dev
```

Run `npm run build` after setting these values. Vite embeds `VITE_*` values in
the browser bundle. If either Supabase browser value is absent, the app stays
in its existing local-only mode and does not upload local stars later.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `IP_HASH_SALT` in an `.env*` file used
by Vite, a `VITE_*` value, source code, or the direct-upload artifact.

## Database

Apply every SQL file in `supabase/migrations/` in filename order in the
Supabase SQL Editor before deployment. The first creates the schema; the
submission-validation migration allows an empty story and enforces the supported
date range (2021-01-26 onward) in both the table and write RPC.
The schema includes:

- `public.stars`: `id`, `catalog_number`, `alias`, `started`, `date`,
  `message`, and `created_at`.
- Public anonymous/authenticated **SELECT only** RLS. There are no public
  INSERT, UPDATE, or DELETE grants/policies.
- `private.star_submission_fingerprints`, which has RLS and no public access.
  It stores only an HMAC-like hashed address fingerprint, never a raw address.
- Realtime publication for `public.stars`.

The Worker is the only writer. It calls the service-only RPC exactly as:

```text
create_star_submission(
  p_id text,
  p_alias text,
  p_started date,
  p_date date,
  p_message text,
  p_ip_hash text
)
```

The RPC uses `catalog_number`'s identity sequence, so a returned catalog number
is authoritative and unique. It makes a repeated `p_id` idempotent, serializes
same-fingerprint attempts, and enforces approximately one submission per ten
seconds and twenty per UTC day. Empty aliases become the final `AL 000001`
style designation in the original INSERT, so Realtime never exposes a
placeholder alias.

## Cloudflare Pages

`public/_worker.js` is copied to `dist/_worker.js` by Vite and runs Pages in
advanced mode. `public/_routes.json` limits Worker invocations to `/api/*`, so
static assets bypass the Function quota.

In the Pages production environment, configure these encrypted secrets:

```text
SUPABASE_URL=https://jykeprbzpbgghxkndqld.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase service-role key>
IP_HASH_SALT=<long, stable random secret; at least 16 characters>
```

`ALLOWED_ORIGINS` is optional and is only for a future trusted custom domain,
as a comma-separated server-side list. The Worker already accepts
`https://claudestarry.pages.dev` plus the two documented local dev origins.
It validates Origin, JSON type and streamed body size, canonical dates and
text bounds, and applies a 15-second timeout to its server-to-Supabase call.
Errors sent to browsers are deliberately sanitized.

For a direct upload:

1. Run `npm ci`, `npm test`, and `npm run build` with `.env.production.local`.
2. Upload the contents of `dist/` in the Pages dashboard to the existing
   `claudestarry` project.
3. Confirm `dist/_worker.js` and `dist/_routes.json` are present, then verify
   `POST https://claudestarry.pages.dev/api/stars` from the deployed page.

## Runtime behavior

The browser creates one Supabase client/channel, subscribes before its initial
fully paginated read (1,000 rows per page), and reconciles with a deduplicated
60-second timestamp overlap on reconnect/visibility changes. An initial read
never replays meteors. A live remote insert can animate only the newest recent
star and does not move someone else's camera, reading card, or intro. The
author's POST retries once with the same `MY-<uuid>` ID and their Realtime echo
is suppressed, so it animates once and retains its own card/focus. Hidden tabs
unsubscribe and stop fallback work; an unavailable socket uses low-frequency
reconciliation while visible.
