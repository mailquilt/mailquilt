# Architecture

How Mailquilt is built so the same code runs fully on Cloudflare or anywhere Docker runs. Capitalized terms are defined in [GLOSSARY.md](../GLOSSARY.md). Decisions with lasting trade-offs are in [docs/adr](adr/).

## Deployment targets

|  | Cloudflare | Docker (Coolify or any host) |
| --- | --- | --- |
| Entry app | `apps/api-worker` | `apps/server` (one Node process) |
| Database | Postgres through Hyperdrive, or a serverless Postgres such as Neon | Postgres in the compose file |
| Storage | R2 | Any S3-compatible store (R2, S3, MinIO) |
| Queue | Cloudflare Queues | pg-boss on Postgres |
| Scheduler | Cron Triggers | pg-boss cron |
| Rate limiting | Workers rate-limiting binding (coarse, per IP) + Postgres counters (precise) | In-memory (coarse, per IP) + Postgres counters (precise); Redis adapter only if several replicas or measured load need it |
| Inbound bounces | Email Workers handler | Provider webhooks; bounce-mailbox polling (P2) |
| Migrations | Run in the deploy step | Run on boot behind a Postgres advisory lock |

Each entry app serves the JSON API, the public pages, and the dashboard's static files. The compose file holds only the app and Postgres.

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `domain` | Schemas, branded and prefixed IDs, domain errors. No input or output | — |
| `contract` | Effect `HttpApi` groups; the single public contract and the source of the OpenAPI spec and the dashboard's typed client | `domain` |
| `core` | Use cases, written only against ports (Effect services) | `domain` |
| `api` | `HttpApi` handlers: each endpoint calls a `core` use case. One `ApiLive` Layer that every entry app serves | `contract`, `core` |
| `db` | Drizzle Postgres schema, migrations, repository implementations | `domain`, ports in `core` |
| `providers` | One adapter per Provider: sending plus parsing its webhooks | `domain` |
| `runtime-cloudflare` | Layers for each port on Cloudflare | ports in `core`, `db` |
| `runtime-node` | Layers for each port on Node | ports in `core`, `db` |

Apps only assemble Layers. On Workers, the runtime is built once per isolate, not per request. The earlier prototype rebuilt every service on every request. Ports are request requirements of `ApiLive`: Node shares one Postgres pool across requests, and Workers opens Postgres per request through Hyperdrive ([ADR 0003](adr/0003-ports-are-provided-per-request.md)).

## Data

- **Postgres only** ([ADR 0001](adr/0001-postgres-only.md)), through Drizzle 1.0's Effect integration (`drizzle-orm/effect-postgres`).
- **IDs:** a type prefix plus a UUIDv7, for example `cnt_…` for a Contact and `cmp_…` for a Campaign. They are part of the public API and never change format.
- **Tenant isolation:** every repository method takes the Organization ID from the request context. No query runs without one. A CI test suite tries to read across Organizations.
- **Delivery events:** one table partitioned by month. A scheduled job creates future partitions. Retention drops whole partitions (13 months by default). Drizzle can't declare partitioned tables, so that migration is written by hand.
- **Campaign totals and Contact engagement summaries** (last opened, counts) are stored separately and outlive raw events.
- **Bulk writes are set-based**, never one query per Contact.
- **Migrations are expand-then-contract:** add in one release, remove in a later one.

## Sending pipeline (outline)

1. **Start:** a Campaign starts (now or when the scheduler finds it due).
2. **Resolve recipients in one set-based query:**
   - Include Contacts subscribed to any targeted List or matching a targeted Segment.
   - Drop excluded Lists and Segments, pending or unsubscribed Subscriptions, Contacts with an Opt-out, and Suppressed addresses.
   - Remove duplicates.
3. **Snapshot** the recipients for the Campaign.
4. **Enqueue** batches. Consumers throttle per Provider Connection, call the Provider adapter, and record the Provider's message ID.
5. **Update state:** Provider webhooks or inbound bounces update delivery events, Suppressions and Campaign totals.
6. **Pause, resume and cancel** act on the snapshot. Batches not yet sent are skipped or re-enqueued.

**Transactional Messages** skip step 2's Subscription and Opt-out checks. They still respect bounce and complaint Suppressions.

## Dashboard

- TanStack Start in **SPA mode**: static files with no server functions. Both entry apps serve them next to the API, and any path that isn't a file or an API route gets the app shell.
- TanStack Query for queries and mutations, through the typed client generated from `contract`.
- Kumo (Base UI and Tailwind v4) for components; `@mailquilt/editor` (through `@mailquilt/react`) for email design.

## Public pages

- Unsubscribe, preference center, double opt-in confirmation, signup form, web archive, tracking pixel and click redirects.
- Rendered on the server by the entry app (React and Kumo rendered to HTML), with no client JavaScript required.
- On hosted, they are served from a separate domain that never receives cookies. On a single-domain self-host, archive pages are served with `Content-Security-Policy: sandbox`.

## Observability

- Structured JSON logs by default.
- OpenTelemetry traces and logs through Effect, exported only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `/health` for Docker and Coolify health checks.
- No usage telemetry. The only call home is an update check, which an environment variable turns off.

## Testing

| Layer | Tool |
| --- | --- |
| `domain`, `core` | Vitest 5 + `@effect/vitest`, with in-memory Layers and `TestClock` |
| `db` | Vitest + Testcontainers (real Postgres): queries, migrations, partitions, cross-Organization isolation |
| `providers` | Vitest with a fake `HttpClient` Layer and recorded responses; Mailpit as the SMTP server |
| End to end | Playwright: sign in → import → send a Campaign → email arrives in Mailpit, against both the Docker image and `wrangler dev` |
| Security | CI suites for isolation, token tampering, rate limits, SSRF blocking, and Better Auth endpoints outside the allow list |

`@cloudflare/vitest-pool-workers` 0.23 requires Vitest 4, while `@effect/vitest` 4.1.5 requires Vitest 5. Until the Workers pool supports Vitest 5, the Cloudflare runtime is covered by the end-to-end run against `wrangler dev`.

## Versions

- Every dependency version is pinned exactly in one pnpm catalog. Upgrades are separate, deliberate changes.
- Baseline (2026-11-21): Effect 4.1.x (`HttpApi` and SQL modules are marked unstable), Drizzle `1.0.0-rc.6`, Better Auth 1.7.x, TypeScript 7, Vitest 5.
- `minimumReleaseAge` is 7 days. Exceptions are listed in `minimumReleaseAgeExclude`, reviewed one by one. The first is `drizzle-orm` (and `drizzle-kit`), because the Effect integration exists only in its newest release candidates.

## Lessons from the earlier prototypes

From `.references/`:

- They built many layers before one email was sent. Here the P1 smoke test sends a real Campaign early.
- They ran D1 only and committed no migrations.
- They rebuilt the runtime on every request.
- They created recipients with one query per Contact.
- Their bounce tokens were unsigned.
- A Campaign could target only one List.
- Dependency versions were mixed across packages.
