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

The static files are written to `dist/client`, with the app shell as `index.html`. Both entry apps serve them next to the API: `apps/server` through `HttpStaticServer`, and `apps/api-worker` through Workers static assets (`assets` in `wrangler.jsonc`). Paths that aren't files or API routes get `index.html`, so the router handles them in the browser. API routes live under `/api` ([ADR 0004](../../docs/adr/0004-api-routes-live-under-api.md)).

## Test

```bash
pnpm --filter dashboard test
```
