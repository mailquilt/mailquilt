# Smoke test

One Playwright test that proves a deployment's pieces work together: it sets up a fresh install, makes an Organization, connects Mailpit as an SMTP Provider Connection, adds a List and Contacts, writes and sends a Campaign through the dashboard, and checks every Contact's email arrived in Mailpit. It holds no rules; those are tested in the packages (`docs/agents/testing.md`).

It runs against the Docker image and against `wrangler dev`, in CI's `smoke` and `smoke-cloudflare` jobs.

## Docker

To run it locally, with Docker running:

```sh
docker compose -p mailquilt-smoke --env-file e2e/smoke.env -f compose.yaml -f compose.test.yaml down -v
docker compose -p mailquilt-smoke --env-file e2e/smoke.env -f compose.yaml -f compose.test.yaml up -d --build --wait
pnpm --filter e2e exec playwright install chromium
pnpm --filter e2e smoke
docker compose -p mailquilt-smoke --env-file e2e/smoke.env -f compose.yaml -f compose.test.yaml down -v
```

The test sets up the install, so it needs a fresh one each run: `down -v` drops the database, before the run as well as after, in case an earlier run stopped before cleaning up. `-p mailquilt-smoke` keeps that apart from any install you run from this checkout, whose database `down -v` would otherwise delete. The app is on http://localhost:3300 and Mailpit's inbox on http://localhost:8325 (`e2e/smoke.env`); set `MAILQUILT_URL` and `MAILPIT_URL` to point the test elsewhere.

## Cloudflare

`wrangler dev` runs the Worker, its Queue and its consumer locally; Postgres stands in for Hyperdrive's origin. With Docker running, from the repository root:

```sh
docker run -d --rm --name mailquilt-smoke-postgres -e POSTGRES_PASSWORD=smoke-test -p 5433:5432 postgres:18.7-alpine
docker run -d --rm --name mailquilt-smoke-mailpit -e MP_SMTP_AUTH_ACCEPT_ANY=true -e MP_SMTP_AUTH_ALLOW_INSECURE=true -p 1026:1025 -p 8326:8025 axllent/mailpit:v1.33.1
export DATABASE_URL=postgres://postgres:smoke-test@127.0.0.1:5433/postgres
pnpm --filter dashboard build
pnpm --filter @repo/db migrate
(set -a; . e2e/smoke.env; set +a; cd apps/api-worker && CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=$DATABASE_URL ./node_modules/.bin/wrangler dev --var "AUTH_SECRET:$AUTH_SECRET" --var "ENCRYPTION_KEYS:$ENCRYPTION_KEYS")
```

Then, in another terminal:

```sh
pnpm --filter e2e exec playwright install chromium
MAILQUILT_URL=http://localhost:8787 MAILPIT_URL=http://localhost:8326 MAILPIT_SMTP_HOST=127.0.0.1 MAILPIT_SMTP_PORT=1026 pnpm --filter e2e smoke
docker stop mailquilt-smoke-postgres mailquilt-smoke-mailpit
```

The connection reaches Mailpit at `127.0.0.1`, because workerd looks names up over DNS and never reads `/etc/hosts`, so `localhost` doesn't resolve there. Stopping the containers drops the database, so the next run starts from a fresh install.
