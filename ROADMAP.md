# Roadmap

Mailquilt ships in four phases. Each phase ends with a demonstrable outcome, written as exit criteria. Capitalized terms are defined in [GLOSSARY.md](GLOSSARY.md). Positioning and pricing are in [docs/product.md](docs/product.md), the technical design in [docs/architecture.md](docs/architecture.md), and the threat model in [docs/security.md](docs/security.md).

| Phase | Goal | Ends with |
| --- | --- | --- |
| **P1: MVP** | Send a real Campaign on both deployment targets | Open-source release and a free hosted beta |
| **P2: Replace Sendy and listmonk** | Everything a switcher needs, importers included | Paid hosted launch |
| **P3: Replace Kit and Mailchimp** | Automations and deliverability tooling | — |
| **P4: Business and scale** | `ee/` features and the self-host Business license | Self-host Business license on sale |

Security work ships in the same phase as the feature it protects. It never waits for a later "hardening" phase.

## Review checkpoints

Every pull request gets a review of its own diff against the release bar in [docs/agents/review.md](docs/agents/review.md). Beyond that, there are only two broad reviews per phase:

- **Design checkpoint (P1 only):** once the first Campaign is sent on Docker and on Cloudflare, one reviewer reads the whole codebase and answers "how well is it written?". At that point every pattern exists once: Organization scoping, ports, errors, IDs, tokens, the test harness. Structural fixes become ADRs and land before the rest of P1 builds on those patterns.
- **Phase end:** one "ready to ship?" review against the release bar. Findings below the bar go to a backlog issue.

---

## P1: MVP

**Exit criteria:** an Organization can import Contacts, design a Template, and send a throttled Campaign through its own SES or SMTP. It sees bounces, unsubscribes and basic statistics. This works on the Docker image and on Cloudflare, and the Playwright smoke test proves it on both.

### Foundation (first)

- Monorepo packages: `domain`, `contract`, `core`, `db`, `providers`, `runtime-cloudflare`, `runtime-node`. Apps: `api-worker`, `server`, `dashboard`, `docs`
- **Spikes before building features:**
  - Effect 4 plus Drizzle `effect-postgres` (1.0 rc) on Workers through Hyperdrive, with the runtime built once per isolate, not per request
  - Kumo in a TanStack Start SPA
  - `@mailquilt/editor` embedded in the dashboard
- One pnpm catalog with exact version pins, and `minimumReleaseAge`
- Postgres schema with prefixed IDs; Organization scoping in every repository
- Delivery events table partitioned by month, with a job that creates partitions ahead of time
- Migrations: on boot behind a Postgres lock (Docker), in the deploy step (Cloudflare); expand-then-contract only
- CI: lint, type-check, tests, `pnpm audit`, CodeQL, secret scanning
- Docker image (non-root, minimal base, SBOM, cosign) published to GHCR; docker-compose file with Postgres; a "Deploy to Cloudflare" button
- `/health` endpoint, structured JSON logs, OpenTelemetry export when configured
- `SECURITY.md` with private vulnerability reporting, `CONTRIBUTING.md`, code of conduct, CLA bot

### Accounts and Organizations

- Better Auth: email and password (leaked-password check), magic link, Google, GitHub; email verification
- Better Auth endpoints sit behind an allow list; rate limiting is on in every environment
- Two-factor sign-in (authenticator app plus backup codes), optional
- Organizations, members, invitations, roles (owner, admin, member)
- Re-confirming sign-in for sensitive actions, with an email to owners
- Security event log (90 days)
- Self-host: first-run setup wizard, invite-only by default, instance settings, System Mailer
- Hosted: Turnstile on sign-up and sign-in; super-admin page to suspend an Organization

### Audience

- Contacts with typed custom fields
- CSV import with field mapping, deduplication and an import report; export (escaped against formula injection)
- Lists and Subscriptions; double opt-in per List with an editable confirmation email
- Opt-out ("Unsubscribe from all"), which only the Contact can lift
- Suppressions: automatic from bounces and complaints, manual, imported
- Hosted signup page and embeddable form; Turnstile (or a honeypot on self-host); double opt-in on by default on hosted

### Content

- `@mailquilt/editor` drag-and-drop editing, plus raw HTML and MJML
- Templates; each Campaign copies its Template's content
- Image uploads through the storage port (size and type limits, no SVG)
- Merge tags with fallbacks, with Contact values escaped
- Plain-text version generated automatically
- Required postal-address footer
- Previews on desktop, mobile and in dark mode, in a sandboxed iframe; test sends

### Sending

- Providers: **SES** (API plus SNS webhooks for bounces and complaints), **SMTP** (send only), **Cloudflare Email** (labelled beta)
- Several Provider Connections per Organization, with defaults for Campaigns and Transactional Messages and an override per Campaign
- Provider credentials encrypted at rest and never returned by the API
- Sending Domain DNS checker for SPF, DKIM, DMARC and return path. A Campaign is blocked on a DKIM failure or missing DMARC record and warned on weaker problems
- Campaigns: several Lists with exclusions and deduplication (Segments as targets arrive with Segments in P2), scheduling with time zones, sending now
- Pause, resume and cancel a Campaign that's mid-send
- Throttling per Provider Connection, reading the SES sending limit automatically
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058 one-click)
- Unsubscribe link (unsubscribes from the Lists the Campaign targeted), "Unsubscribe from all" and "Manage preferences"
- HMAC-signed tokens in every unsubscribe, tracking and bounce link
- Open and click tracking, which requires the Organization's own tracking domain on hosted

### Analytics

- Campaign report: delivered, opens (flagged as inflated by Apple Mail Privacy Protection), clicks, bounces, complaints, unsubscribes

### Platform

- Public REST API generated from the contract, with OpenAPI docs rendered in Blume
- API keys: hashed, `mq_` prefix, scopes, last used, revocation, rate limit per key
- Public pages (unsubscribe, preferences, confirmation, signup) rendered on the server; on hosted, served from a separate domain that never receives cookies
- Landing page and docs in Blume, with setup guides for SES, SMTP and DNS

### Hosted beta

- Terms of Service, Privacy Policy, Acceptable Use Policy; a "report abuse" link on public pages

---

## P2: Replace Sendy and listmonk

**Exit criteria:** someone on Sendy, listmonk, Mailchimp or Kit can import everything, keep sending through their own Provider, and run their newsletter without missing a feature they relied on. Paid hosted billing is live.

### Audience

- **Importers** from Mailchimp, Kit, Substack, Sendy and listmonk
- Tags and Segments (rule builder)
- Timeline per Contact (every email, open, click and List change)
- Preference center
- Consent records; GDPR data export and deletion per Contact
- Address checks on import and in forms: syntax, a working mail server, disposable and role addresses

### Content

- Markdown editor
- Saved blocks; brand kit (logo, colors, fonts)
- Starter Template gallery
- Link checker; size and spam checks
- Public web archive with an RSS feed (rendered on the server so search engines can index it)

### Sending

- **Transactional Messages API** with Templates and idempotency keys
- Native Provider adapters with bounce and complaint webhooks: Resend, Postmark, Mailgun, SendGrid, Brevo and more
- Bounce-mailbox polling for plain SMTP
- Custom tracking domain setup; custom domains for public pages (Cloudflare for SaaS on hosted)
- One-click DNS setup when the domain is on Cloudflare
- Readiness check against the Gmail, Yahoo and Microsoft sender rules before sending
- Automatic pause when complaints approach 0.3% or bounces spike
- Automatic UTM tagging; resend to non-openers; duplicate a Campaign

### Analytics

- Click report per link
- Filtering out opens and clicks from bots and security scanners
- List growth and engagement dashboards

### Platform

- Outbound webhooks: signed, with retries, through the outbound guard that blocks internal networks
- Generated TypeScript SDK (`@mailquilt/sdk`)
- hCaptcha as an alternative to Turnstile
- Organization setting to require two-factor sign-in
- Command palette, keyboard navigation, i18n
- Backup and upgrade guides
- "Mailquilt vs X" comparison pages

### Paid launch

- Creem billing for Pro and Agency, trials, failed-payment handling
- Data processing agreement (DPA) and subprocessor list
- 30-day read-only period after cancellation, then deletion
- `TRADEMARK.md`

---

## P3: Replace Kit and Mailchimp

**Exit criteria:** a customer can build a welcome series and a tag-triggered drip visually, and Mailquilt actively protects their deliverability.

### Automations

- Visual builder
- **Triggers:** joined a List, Tag added or removed, field changed, custom Event sent through the API, a date (birthday or anniversary), opened or clicked
- **Steps:** send, wait, branch on a condition, Tag, update a field, webhook, goal or exit
- Statistics per step
- RSS-to-email

### Sending and deliverability

- A/B tests on subject and content, with an automatic winner
- Warm-up schedules
- Opt-in failover between Provider Connections, only on Provider-level failures and never re-sending to an accepted recipient
- Sending in each recipient's time zone
- Cap on how often a Contact is emailed across Campaigns and Automations
- Automatic cleanup of long-inactive Contacts
- Engagement score per Contact
- Gmail Postmaster Tools data; blocklist monitoring

### Content and growth

- Conditional content
- Popups and landing pages
- AI writing help (subject lines, rewriting, translation) using an AI key the customer brings, never gated. This builds on the editor's own AI and HTML-import work when it lands

### Platform

- MCP server so AI agents can use Mailquilt
- Integrations: Zapier, Make, n8n, Stripe customer sync, WordPress, Ghost

---

## P4: Business and scale

**Exit criteria:** the self-host Business license is on sale and its features work on both deployment targets.

- `ee/` (commercial license): white-label, SSO/SAML, full audit log (every change, exportable to a SIEM), advanced roles, approval workflow before sending
- License keys checked through the Merchant of Record, with a generous offline grace period
- Combined billing across an agency's Organizations
- Paid external penetration test, once revenue allows

---

## Not planned

- Mailquilt-operated sending ([ADR 0002](docs/adr/0002-customers-bring-their-own-provider.md))
- Paid subscriptions, referral programs, ad network
- D1 or any database other than Postgres ([ADR 0001](docs/adr/0001-postgres-only.md))
- Usage telemetry from self-hosted installs
