# API routes live under `/api`; `/health` is the only exception

The entry app serves the API and the dashboard's static files from one origin. On Cloudflare, static assets answer first: a path that isn't a file gets the dashboard's `index.html` whoever asks, and reaches the Worker only if it matches `run_worker_first` in `wrangler.jsonc`. A route missing from that list works on Docker and silently returns HTML on Cloudflare. So every API route lives under `/api`, listed once as `/api/*`, and `MailquiltApi` applies the prefix to its groups. A contract test fails if any endpoint other than `/health` is outside `/api`. `/health` stays at the root because Docker and Coolify health checks expect it there.

## Considered Options

- **List each route in `run_worker_first`:** every new endpoint has to remember a config file that nothing checks.
- **Route every request through the Worker (`run_worker_first: true`) and forward the rest to the assets binding:** every page load and asset then runs the Worker, which costs a Worker invocation and adds latency for files Cloudflare could serve directly.

## Consequences

- Better Auth, provider webhooks and every `HttpApi` group mount under `/api`.
- Public pages (unsubscribe, preference center, tracking) are also answered by the Worker. The first of them picks one prefix of its own and adds it to `run_worker_first` the same way.
- On Node, an unknown path under `/api` returns 404 instead of the dashboard, as it does on Workers.
