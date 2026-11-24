# Smoke test

One Playwright test that proves a deployment's pieces work together: it sets up a fresh install, makes an Organization, connects Mailpit as an SMTP Provider Connection, adds a List and Contacts, writes and sends a Campaign through the dashboard, and checks every Contact's email arrived in Mailpit. It holds no rules; those are tested in the packages (`docs/agents/testing.md`).

It runs against the Docker image, in CI's `smoke` job. To run it locally, with Docker running:

```sh
docker compose --env-file e2e/smoke.env -f compose.yaml -f compose.test.yaml up -d --build --wait
pnpm --filter e2e exec playwright install chromium
pnpm --filter e2e smoke
docker compose --env-file e2e/smoke.env -f compose.yaml -f compose.test.yaml down -v
```

The test sets up the install, so it needs a fresh one each run: `down -v` drops the database. The app is on http://localhost:3300 and Mailpit's inbox on http://localhost:8325 (`e2e/smoke.env`); set `MAILQUILT_URL` and `MAILPIT_URL` to point the test elsewhere.
