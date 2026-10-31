# Deploy a shared Claude Starry galaxy

This guide deploys an independent Claude Starry instance with Supabase and Cloudflare Pages. Replace every placeholder with values from your own projects and domains.

## Architecture

- The browser reads shared stars with a public Supabase anonymous key.
- The Cloudflare Pages Worker is the only writer. It validates submissions, rate-limits them, hashes the source address with a server-side salt, and calls the service-only database RPC.
- `public/_worker.js` and `public/_routes.json` are copied into `dist/` during the Vite build. The Worker handles `/api/*`; static assets bypass it.

## 1. Create the Supabase project

Create a Supabase project, then run every SQL file in `supabase/migrations/` in filename order with the SQL Editor or your normal migration workflow.

The migrations create the public `stars` table, its read-only browser policies, the private submission-fingerprint store, Realtime publication, and the `create_star_submission` RPC. Do not grant browser roles direct insert, update, or delete access: the Worker should remain the only writer.

## 2. Configure the browser build

Copy `.env.example` to `.env.production.local` and provide only browser-safe values:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
VITE_PUBLIC_SITE_URL=https://your-site.example
```

Vite embeds `VITE_*` values into the browser bundle. If either Supabase browser value is absent, the application stays browser-local and does not upload prior local records when shared storage is later enabled.

For Git-integrated Cloudflare Pages builds, set the three public `VITE_*` values in the Pages project’s encrypted environment variables. The existing `claudestarry` Pages project is connected to this GitHub repository and deploys the `main` branch automatically; `.env.production.local` stays local and is not uploaded to GitHub.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `IP_HASH_SALT` in a `VITE_*` variable, source file, browser-readable environment file, or build artifact.

## 3. Configure Cloudflare Pages

Create or reuse a Cloudflare Pages project connected to this repository. Set the production branch to `main`; pushes to `main` then deploy through Cloudflare’s Git integration without storing a Cloudflare API token in GitHub.

The build settings used by the workflow are:

```text
Build command: npm run build
Build output directory: dist
```

Set these encrypted Pages environment variables for the production environment:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
IP_HASH_SALT=<a stable random secret of at least 16 characters>
ALLOWED_ORIGINS=https://your-site.example
```

`ALLOWED_ORIGINS` is a comma-separated list of exact browser origins allowed to submit stars. Use scheme and host only—no path and no trailing slash. Include each production or custom-domain origin that should be able to post, for example:

```text
ALLOWED_ORIGINS=https://your-site.example,https://www.your-site.example
```

The Worker already permits `http://127.0.0.1:4317` and `http://localhost:4317` for local development. Do not use wildcard origins. Keep the service-role key and hash salt only in Pages’ server-side environment.

The following values must remain Cloudflare Pages server-side runtime variables and are never prefixed with `VITE_`:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
IP_HASH_SALT
ALLOWED_ORIGINS
```

Keep `SUPABASE_SERVICE_ROLE_KEY` and `IP_HASH_SALT` only in Cloudflare Pages’ encrypted environment. Do not copy them into GitHub or the browser build.

## 4. Build and publish

Run the checks and create the deployable output:

```sh
npm ci
npm test
npm run build
```

Cloudflare Pages publishes the generated `dist/` directory through its Git integration. Confirm that `dist/_worker.js` and `dist/_routes.json` are included alongside the static assets.

## 5. Verify the deployment

1. Open the deployed site from an origin listed in `ALLOWED_ORIGINS`.
2. Add a test star and confirm it appears after a refresh or in a second browser session.
3. Confirm the browser receives only the public URL and anonymous key; inspect the deployed settings to ensure the service-role key and hash salt are not exposed.
4. If submissions return an origin error, compare the browser’s full origin with `ALLOWED_ORIGINS`, including protocol and any `www` subdomain.

## Runtime behavior

The client subscribes before its first paginated read, reconciles recent records after reconnects, and avoids replaying meteors for the initial history. A visitor’s own submission reuses its generated ID on a retry and animates once when it returns. Hidden tabs stop their realtime work until they are visible again.
