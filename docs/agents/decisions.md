# Decisions

Accepted limits, and rules a review doesn't raise again unless something has changed since, such as a bug report or a new feature that depends on them. A pull request that changes one of these says so, gives the reason and updates this page.

The larger decisions are ADRs in `docs/adr/`: Postgres only (0001), and customers bring their own Provider (0002). The overall design is in `docs/architecture.md`, and the security controls are in `docs/security.md`. The entries below came out of the planning on 2026-11-21 unless an issue is named.

## Consent and sending

- A Campaign goes only to Contacts with a subscribed Subscription to a targeted List. It leaves out anyone on an excluded List, with an Opt-out, or with a Suppressed address. Each Contact gets it once.
- "Unsubscribe", both the link and the one-click header, unsubscribes the Contact from every List the Campaign targeted, not just one.
- "Unsubscribe from all" records an Opt-out. Only the Contact can lift it, through a form or the preference center. An import or the API never can.
- An import never subscribes again a Contact who unsubscribed or has an Opt-out.
- A Transactional Message ignores Subscriptions and Opt-outs but respects Suppressions from bounces and complaints.
- A hard bounce or a complaint suppresses the address at once. Soft bounces suppress it after 3 within 7 days.
- A Campaign holds its own copy of its content. Editing the Template later never changes it.
- A Sending Domain that fails DKIM or has no DMARC record blocks a send. SPF alignment problems and `p=none` only warn.
- Every Campaign message has `List-Unsubscribe` and `List-Unsubscribe-Post`, a plain-text part and the Organization's postal address.
- Double opt-in is on by default for hosted signup forms, and an owner can turn it off for a List.

## Providers

- Mailquilt never sends an Organization's email itself, on the hosted service either. Its own account emails go through the System Mailer (ADR 0002).
- An Organization can have several Provider Connections, with one default for Campaigns and one for Transactional Messages, and an override per Campaign. Failover between them is P3 and opt-in.
- Cloudflare Email is labelled beta, because Cloudflare's docs describe it for transactional mail and haven't confirmed bulk sending.
- SES is called through `aws4fetch` on both targets, so one adapter runs on Workers and Node.
- Plain SMTP has no bounce handling beyond signed bounce addresses until bounce-mailbox polling in P2.

## Data

- Postgres is the only database, including on Cloudflare (ADR 0001).
- IDs are a type prefix plus a UUIDv7, such as `cnt_…`. They're part of the public API.
- Every repository method takes the Organization ID from the request context. There's no unscoped query path for tenant data, and Postgres row-level security isn't used.
- Delivery events are partitioned by month through a hand-written migration, and dropped after 13 months by default. Campaign totals and Contact engagement summaries outlive them.
- Imports, recipient snapshots and event writes are set-based. There's never a query per Contact.
- Migrations are expand-then-contract. They run on boot behind an advisory lock in Docker, and in the deploy step on Cloudflare.
- An Organization's data is deleted 30 days after a hosted plan is cancelled.

## Security

- Better Auth sits behind our own allow list of endpoints. `disabledPaths` is only a second layer, and plugins we don't use aren't installed.
- Better Auth's rate limiter uses our `RateLimiter` port in every environment. Its in-memory store is never used.
- The client IP is read only from the configured header: `cf-connecting-ip` on Cloudflare, the proxy's header on Docker.
- Every outbound request to a user-chosen address goes through the outbound guard. It's always on for hosted; self-hosted installs allow private networks by default.
- On the hosted service, public pages are served from a domain that never receives cookies, and open and click tracking requires the Organization's own tracking domain.
- Redis isn't used. A Redis rate limiter is added only if several replicas or measured Postgres load need it.
- Self-hosted installs send no usage telemetry, only an update check that can be turned off.

## Building and testing

- The dashboard is a static SPA. Public pages are rendered on the server by the same deployed app.
- On Node, pg-boss is both the Queue and the Scheduler.
- Persistence is never tested with in-memory fakes (see `testing.md`).
- `@cloudflare/vitest-pool-workers` isn't used while it needs Vitest 4 and `@effect/vitest` needs Vitest 5. The Cloudflare runtime is covered by the smoke test on `wrangler dev`.
- Every dependency is pinned exactly in one pnpm catalog, with a 7-day `minimumReleaseAge`. `drizzle-orm` and `drizzle-kit` are excluded, because the Effect integration exists only in their newest release candidates.
- CI installs with `--frozen-lockfile` in every job, so tests never meet a dependency version the repo hasn't taken on purpose.
- Dependencies are updated by hand, with no Renovate or Dependabot update PRs, so no third-party app gets write access to the repo. Dependabot alerts and `pnpm audit` in CI flag vulnerable versions. At each checkpoint in `ROADMAP.md`, run `pnpm outdated -r` and update what's worth it. This replaces the Renovate setup from #3.

## Product

- No core feature is gated by hosted plan. `ee/` holds only white-label, SSO, the full audit log, advanced roles and the approval workflow, from P4.
- Creator monetization (paid subscriptions, referrals, ad network) isn't planned.
