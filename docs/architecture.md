# Architecture

How Mailquilt is built so the same code runs fully on Cloudflare or anywhere Docker runs. Capitalized terms are defined in [GLOSSARY.md](../GLOSSARY.md). Decisions with lasting trade-offs are in [docs/adr](adr/).

This is the design P1 builds toward. Where a part isn't built yet, it says **planned** and names the issue that builds it.

## Deployment targets

|  | Cloudflare | Docker (Coolify or any host) |
| --- | --- | --- |
| Entry app | `apps/api-worker` | `apps/server` (one Node process) |
| Database | Postgres through Hyperdrive, or a serverless Postgres such as Neon | Postgres in the compose file |
| Storage (planned, #25) | R2 | Any S3-compatible store (R2, S3, MinIO) |
| Queue | Cloudflare Queues, fed from an outbox table ([ADR 0014](adr/0014-queued-work-acts-in-the-organization-its-message-names.md)) | pg-boss on Postgres |
| Scheduler | Cron Triggers | pg-boss cron |
| Rate limiting | Postgres counters | Postgres counters; a Redis adapter only if several replicas or measured load need it |
| Inbound bounces (planned, #19, #21) | Email Workers handler | Provider webhooks; bounce-mailbox polling (P2) |
| Migrations | Run in the deploy step | Run on boot behind a Postgres advisory lock |

Each entry app serves the JSON API, the public pages, and the dashboard's static files. The compose file holds only the app and Postgres.

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `domain` | Schemas, branded and prefixed IDs, domain errors. No input or output | — |
| `contract` | Effect `HttpApi` groups; the single public contract and the source of the OpenAPI spec and the dashboard's typed client | `domain` |
| `core` | Use cases, written only against ports (Effect services) | `domain` |
| `api` | `HttpApi` handlers: each endpoint calls a `core` use case. Better Auth behind our allow list ([ADR 0005](adr/0005-better-auth-runs-per-request-on-the-sql-client.md)). One `ApiLive` Layer that every entry app serves | `domain`, `contract`, `core` |
| `db` | Drizzle Postgres schema, migrations, repository implementations | `domain`, ports in `core` |
| `providers` | One adapter per Provider, implementing its Provider port from `core`. Use cases reach them through `sendThrough` ([ADR 0015](adr/0015-use-cases-send-through-a-provider-connection-with-one-function.md)). Parsing Provider webhooks is planned (#19, #21) | `domain`, ports in `core` |
| `runtime-cloudflare` | Layers for each port on Cloudflare | `domain`, ports in `core`, `db`, `providers` |
| `runtime-node` | Layers for each port on Node | ports in `core`, `db`, `providers` |

Apps only assemble Layers. On Workers, the runtime is built once per isolate, not per request. The earlier prototype rebuilt every service on every request. Ports are request requirements of `ApiLive`: Node shares one Postgres pool across requests, and Workers opens Postgres per request through Hyperdrive ([ADR 0003](adr/0003-ports-are-provided-per-request.md)). Better Auth is built per request on the same `SqlClient` ([ADR 0005](adr/0005-better-auth-runs-per-request-on-the-sql-client.md)).

## Data

- **Postgres only** ([ADR 0001](adr/0001-postgres-only.md)), through Drizzle 1.0's Effect integration (`drizzle-orm/effect-postgres`).
- **IDs:** a type prefix plus a UUIDv7 in the TypeID format, for example `org_01h455vb4pex5vsknk084sn02q` for an Organization and `cmp_…` for a Campaign ([ADR 0006](adr/0006-ids-follow-the-typeid-format.md)). They are part of the public API and never change format.
- **Tenant isolation:** endpoints for one Organization's data name it in the path (`/api/organizations/:organizationId/…`). `asMemberOf` checks membership on every request and provides `CurrentOrganization`, which every repository method for tenant data requires, so no such query runs without one ([ADR 0007](adr/0007-tenant-endpoints-name-the-organization-in-the-path.md)). The one exception is unsubscribe (`/unsubscribe`), which has no session: its signed token names the Organization, Campaign and Contact, and it changes only that Contact's Subscriptions to the Campaign's Lists and their Opt-out ([ADR 0016](adr/0016-links-in-emails-carry-tokens-signed-with-keys-derived-from-encryption-keys.md)). A CI test suite tries to read across Organizations, including through unsubscribe links.
- **Paging:** collections that grow with an Organization's audience, such as Contacts, come a page at a time, newest first, with IDs as the cursors and a total ([ADR 0008](adr/0008-long-collections-are-paged-by-id.md)).
- **Delivery events:** one table partitioned by month. A scheduled job creates future partitions. Retention will drop whole partitions, 13 months by default (planned, #22). Drizzle can't declare partitioned tables, so that migration is written by hand.
- **Campaign totals and Contact engagement summaries** (last opened, counts) are stored separately and outlive raw events.
- **Bulk writes are set-based**, never one query per Contact.
- **Migrations are expand-then-contract:** add in one release, remove in a later one.

## Sending pipeline (outline)

Today a Campaign is sent now to the subscribed Contacts of one List without an Opt-out, in batches through its Provider Connection. Targeting several Lists and exclusions (#15), Suppressions (#14), scheduling (#16), throttling (#18), Provider events (#19, #21) and pause, resume and cancel (#17) are planned.

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

- TanStack Start in **SPA mode**: static files with no server functions. Both entry apps serve them next to the API, and a browser asking for a page that isn't a file or an API route gets the app shell. Dashboard routes never end in a file extension, because Node falls back to the shell only for paths without one. API routes live under `/api`, except `/health` ([ADR 0004](adr/0004-api-routes-live-under-api.md)).
- A page that keeps what it shows in the address reads only the search its route decodes; a route redirects an address with a part that doesn't parse to the cleaned one ([ADR 0012](adr/0012-a-page-reads-only-the-search-its-route-decodes.md)).
- TanStack Query for queries and mutations, through the typed client generated from `contract`.
- TanStack Form for forms, validated with the Effect schemas in `domain` through Standard Schema, so the dashboard and the API check the same rules.
- Kumo (Base UI and Tailwind v4) for components; `@mailquilt/editor` (through `@mailquilt/react`) for email design (planned, #24).

## Public pages

- Built: unsubscribe (`/unsubscribe`, `packages/api/src/unsubscribe/`), with the one-click post and the Opt-out (#12).
- Planned: preference center, double opt-in confirmation, signup form, web archive, tracking pixel and click redirects (#13, #23, #29, #30, #38).
- Rendered on the server by the entry app with React and Kumo (`renderToStaticMarkup`), with no client JavaScript needed; only a theme script, allowed by its hash, picks light or dark. They're written in `.ts` with `createElement`, not JSX, because the Node server runs its TypeScript with Node's type stripping, which can't read JSX. They link the dashboard's own stylesheet, which its build also publishes as `/public-pages.css` (`apps/dashboard/vite.config.ts`), so Kumo and the Mailquilt theme look the same as in the dashboard.
- On Cloudflare each public path is listed in `run_worker_first` (ADR 0004).
- On hosted, they are served from a separate domain that never receives cookies. On a single-domain self-host, archive pages are served with `Content-Security-Policy: sandbox`.

## Observability

- `/health` for Docker and Coolify health checks.
- No usage telemetry.
- Planned (#40): structured JSON logs by default (today the apps print Effect's default text format); OpenTelemetry traces and logs through Effect, exported only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; an update check, the only call home, which an environment variable turns off.

## Testing

| Layer | Tool |
| --- | --- |
| `domain`, `core` | Vitest 5 + `@effect/vitest`, with in-memory Layers and `TestClock` |
| `db` | Vitest + Testcontainers (real Postgres): queries, migrations, partitions, cross-Organization isolation |
| `providers` | Vitest with a fake `HttpClient` Layer and recorded responses; Mailpit as the SMTP server |
| End to end | Playwright: first-run setup → add a Provider Connection, a List and Contacts → send a Campaign → email arrives in Mailpit, against both the Docker image and `wrangler dev` |
| Security | CI suites for isolation, rate limits, SSRF blocking, and Better Auth endpoints outside the allow list; token tampering comes with the first signed token (#12) |

`@cloudflare/vitest-pool-workers` 0.23 requires Vitest 4, while `@effect/vitest` 4.1.4 requires Vitest 5. Until the Workers pool supports Vitest 5, the Cloudflare runtime is covered by the end-to-end run against `wrangler dev`.

## Versions

- Every dependency version is pinned exactly in one pnpm catalog. Upgrades are separate, deliberate changes.
- Baseline (2026-11-21): Effect 4.1.x (`HttpApi` and SQL modules are marked unstable), Drizzle `1.0.0-rc.6`, Better Auth 1.7.x, TypeScript 7, Vitest 5.
- `minimumReleaseAge` is 7 days. Exceptions are listed in `minimumReleaseAgeExclude`, reviewed one by one. The first is `drizzle-orm` (and `drizzle-kit`), because the Effect integration exists only in its newest release candidates.

## Lessons from the earlier prototypes

The earlier prototypes aren't in this repo.

- They built many layers before one email was sent. Here the P1 smoke test sends a real Campaign early.
- They ran D1 only and committed no migrations.
- They rebuilt the runtime on every request.
- They created recipients with one query per Contact.
- Their bounce tokens were unsigned.
- A Campaign could target only one List.
- Dependency versions were mixed across packages.
