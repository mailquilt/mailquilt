# Decisions

Accepted limits, and rules a review doesn't raise again unless something has changed since, such as a bug report or a new feature that depends on them. A pull request that changes one of these says so, gives the reason and updates this page.

The larger decisions are ADRs in `docs/adr/`: Postgres only (0001), customers bring their own Provider (0002), ports provided per request (0003), API routes under `/api` (0004), and Better Auth per request on the `SqlClient` (0005), IDs in the TypeID format (0006), tenant endpoints that name the Organization in the path (0007), long collections paged by ID (0008), secrets sealed under versioned keys bound to their row (0009), outbound connections going to the address the guard checked (0010), and the install set up once with settings only its instance admin can reach (0011). The overall design is in `docs/architecture.md`, and the security controls are in `docs/security.md`. The entries below came out of the planning on 2026-11-21 unless an issue is named.

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
- An SMTP Provider Connection's encryption is `tls` (from the start), `starttls` or `none`. `starttls` refuses a server that doesn't offer STARTTLS rather than sending unencrypted (#9).
- Both the SMTP username and password are credentials: sealed, write-only, never returned. Some services, such as Postmark, use the same secret token for both (#9).
- A test email goes to any address the member types, through the connection's default sender, at most 10 every 10 minutes per person across Organizations. When the Provider refuses it, the API answers 502 `SendFailed` with the Provider's own words, so the member can fix the settings (#9).
- A Provider Connection can be edited and deleted. An edit that leaves credentials out keeps them; `null` removes them. Changing the host, port or encryption while keeping saved credentials is refused (`CredentialsRequired`), so a member can't send someone else's password to a server they control or unencrypted (#9).
- A DNS lookup that fails (timeout, server failure) is reported as `unreachable` with the resolver's reason; only a name with no address is `host-not-found` (#9).
- Until the Workers SMTP adapter (#11), an SMTP Provider Connection can be saved on Cloudflare, and sending through it fails with `SendFailed` reason `unavailable` (#9).

## The install

- First-run setup makes the instance admin once, in the same transaction as the `instance` row, and never opens again. Whoever reaches a fresh install first becomes its instance admin; there is no setup token (ADR 0011, #7).
- The instance admin's email is marked verified at setup, because a fresh install has no System Mailer yet (ADR 0011, #7).
- Sign-up is invite-only by default, and refused before setup too, with 403 `SIGN_UP_CLOSED`. Until invitations (#34), invite-only means nobody can sign up (#7).
- The System Mailer sends through SMTP, with the same adapter and outbound guard as Provider Connections. Its saved credentials are sealed and write-only, and only go to the server they were entered for, as a Provider Connection's do (#7).
- `SYSTEM_MAILER_*` environment variables win over the System Mailer saved on the settings page, which then can't be changed (409 `SystemMailerFromEnvironment`). Some set but not all that are needed stops the app (#7).
- An account email that can't be sent is logged with its subject and the failure's reason, never the address or the server's reply, which often quotes it. Sign-up still succeeds (#7).

## Data

- Postgres is the only database, including on Cloudflare (ADR 0001).
- IDs are a type prefix plus a UUIDv7 in the TypeID format, such as `org_01h455vb4pex5vsknk084sn02q`. They're part of the public API (ADR 0006).
- Every repository method for tenant data requires `CurrentOrganization` from the request context, which only `asMemberOf` provides after checking membership. There's no unscoped query path for tenant data, and Postgres row-level security isn't used (ADR 0007).
- The Organization a request acts in is named in its path, not stored on the session, so two tabs can work in two Organizations. The dashboard remembers each tab's choice (ADR 0007, #6).
- A Contact's email address is unique per Organization regardless of case, and kept as entered (#8).
- Adding Contacts to a List subscribes only those with no Subscription to that List yet. An existing Subscription keeps its status, so a member can't subscribe again someone who unsubscribed, or skip a pending confirmation. The answer says how many were left as they were (#8).
- Adding Contacts to a List takes up to 50 at once (one page), and adds nobody if one of them doesn't exist (#8).
- Collections that grow with an Organization's audience are paged by ID, newest first, 50 per page, with a total and cursors both ways. Lists and Organizations are returned whole (ADR 0008, #8).
- Delivery events are partitioned by month through a hand-written migration, and dropped after 13 months by default. Campaign totals and Contact engagement summaries outlive them.
- Imports, recipient snapshots and event writes are set-based. There's never a query per Contact.
- Migrations are expand-then-contract. They run on boot behind an advisory lock in Docker, and in the deploy step on Cloudflare.
- An Organization's data is deleted 30 days after a hosted plan is cancelled.

## Security

- Better Auth sits behind our own allow list of endpoints. `disabledPaths` is only a second layer, and plugins we don't use aren't installed.
- Better Auth's rate limiter uses our `RateLimiter` port in every environment. Its in-memory store is never used.
- The client IP is read only from the configured header: `cf-connecting-ip` on Cloudflare, the proxy's header on Docker.
- Every outbound request to a user-chosen address goes through the outbound guard, and connects to the address it checked (ADR 0010). It's always on for hosted; self-hosted installs allow private networks and loopback by default. Cloud metadata, link-local and reserved addresses are always refused (#9).
- Secrets at rest are sealed with AES-256-GCM under `ENCRYPTION_KEYS`, bound to their row; the app doesn't start without valid keys (ADR 0009, #9).
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
