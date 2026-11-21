# Dashboard

The Mailquilt dashboard: a static single-page app built with TanStack Start in SPA mode, Kumo on Tailwind v4, and TanStack Query. It has no server of its own. It talks only to the API, through the typed client generated from `@repo/contract` (`src/api.ts`).

## Develop

```bash
pnpm --filter server dev     # the API on http://localhost:3000
pnpm --filter dashboard dev  # the dashboard on http://localhost:3001
```

`vite dev` forwards `/api/*` and `/health` to the API on `http://localhost:3000` (`server.proxy` in `vite.config.ts`). The port is fixed: if 3001 is taken, `vite dev` stops instead of picking another.

## Build

```bash
pnpm --filter dashboard build
```

The static files are written to `dist/client`, with the app shell as `index.html`. Both entry apps serve them next to the API: `apps/server` through `HttpStaticServer`, and `apps/api-worker` through Workers static assets (`assets` in `wrangler.jsonc`). A browser asking for a page that isn't a file or an API route gets `index.html`, so the router handles it in the browser. On Node that fallback applies only to paths without a file extension, so dashboard routes never end in one (`/campaigns/cmp_…`, not `/export.csv`). API routes live under `/api` ([ADR 0004](../../docs/adr/0004-api-routes-live-under-api.md)).

## Test

```bash
pnpm --filter dashboard test
```
