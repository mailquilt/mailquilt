# Security

Mailquilt's threat model and the controls that answer it. Each control ships in the same phase as the feature it protects (see [ROADMAP.md](../ROADMAP.md)). The verification checklist is **OWASP ASVS Level 2**. Capitalized terms are defined in [GLOSSARY.md](../GLOSSARY.md).

## What we protect

| Asset | Why it matters |
| --- | --- |
| Provider Connection credentials | A stolen SES key sends spam on the customer's bill and burns their domain |
| Contacts and delivery events | Personal data under GDPR, and the customer's business asset |
| Accounts and sessions | A hijacked account can export Contacts or send through the customer's Provider |
| Sending Domains and sender reputation | One abusive send can blocklist a customer's domain, or on hosted a shared Mailquilt domain |
| The hosted service itself | Abuse of one tenant must not hurt the others |

## Who attacks, and how

- **Anonymous internet users:**
  - Credential stuffing and brute force.
  - Signup-form bombing (entering a victim's address into many forms).
  - Forging unsubscribe or tracking links.
  - Open redirects.
  - Denial of service.
- **A signed-in user of another Organization:** reading or changing data across tenants.
- **A malicious hosted customer:**
  - Phishing or malware in archive pages.
  - SSRF through webhooks, RSS, image imports or SMTP hosts.
  - Spam through signup forms.
- **A compromised member account:** adding Provider Connections or API keys, exporting Contacts, sending spam.
- **The supply chain:** malicious npm packages, compromised build or image.

## Controls

### Authentication (Better Auth)

- **Endpoint allow list.** Our router forwards only the Better Auth endpoints we use; everything else returns 404 first. `disabledPaths` is a second layer. Unused plugins are never installed.
- **Sign-in methods:** email and password (with the Have I Been Pwned leaked-password check), magic link, Google, GitHub. Email verification is required.
- **Two-factor sign-in:** optional in P1 (authenticator app plus backup codes). Organizations can require it from P2.
- **Responses don't reveal whether an account exists.**
- **Cookies:** httpOnly, Secure, SameSite=Lax. The CSRF check stays on, and `trustedOrigins` is explicit.
- **Sessions:** members see their active sessions and can sign each one out.
- **Client IP header** is set explicitly: `cf-connecting-ip` on Cloudflare, the reverse proxy's header on Docker. The default `x-forwarded-for` can be forged by clients.
- **Re-confirmation:** sensitive actions need a sign-in within the last 10 minutes, and Organization owners get an email:
  - adding or changing a Provider Connection
  - creating an API key
  - exporting Contacts
  - inviting a member or changing a role
  - turning off 2FA
  - deleting the Organization
- **Hosted:** Turnstile on sign-up and sign-in.
- **Self-hosted:** invite-only by default; a first-run wizard creates the instance admin.

### Authorization and tenant isolation

- Every endpoint declares the role it needs.
- Every repository method requires the Organization ID from the request context.
- A CI test suite attempts cross-Organization reads and writes.
- **API keys:**
  - shown once and stored as a hash
  - `mq_` prefix, so GitHub secret scanning catches leaks
  - scoped, with last-used time and revocation
  - not usable from browsers (no CORS)

### Rate limiting

One `RateLimiter` port is used everywhere, including by Better Auth through its custom storage. Better Auth's default in-memory store is never used, and limits are on in every environment.

| Key | Applies to | Default (tunable) |
| --- | --- | --- |
| IP | Sign-in | 5 per minute |
| Account | Sign-in | 20 per hour |
| Email address | Password reset, magic link | 3 per hour |
| IP | Public signup form | 10 per minute |
| API key | Public API | 600 per minute |
| User | Dashboard API | Generous; stops runaway clients |
| Organization | Imports and sending | Bounded by plan fair use and the Provider's sending limit |

Backends are listed in [architecture.md](architecture.md#deployment-targets).

### Public endpoints

- **Signed tokens:** unsubscribe, preference, tracking and bounce (VERP) tokens are HMAC-signed with rotating keys. They never expose sequential IDs.
- **Click redirects** go only to the URL inside the signed token, so they can't be used as open redirects.
- **Signup forms:**
  - Turnstile, with hCaptcha as an alternative from P2. No reCAPTCHA.
  - A honeypot field when no captcha is configured.
  - Double opt-in on by default on hosted.
- **Separate public domain on hosted:** public pages are served from a domain that never receives cookies. On a single-domain self-host, archive pages are sent with `Content-Security-Policy: sandbox`.
- **"Report abuse"** link on hosted public pages; a super-admin can suspend an Organization.

### Incoming webhooks

- Every Provider's signature is verified. The SNS signing certificate URL must be HTTPS on an `amazonaws.com` host.
- Replay protection: timestamps and message-ID deduplication.
- Processing is idempotent.

### Outbound requests (SSRF)

All of these go through one outbound guard:

- outgoing webhooks
- RSS fetches
- image import from a URL
- SNS certificate fetches
- SMTP hosts

The guard blocks private, link-local, loopback and cloud metadata addresses. It checks again after DNS resolution and limits redirects, timeouts and response size.

- **Hosted:** always on.
- **Self-hosted:** private networks are allowed by default (internal SMTP relays are normal), and one setting turns the block on.

Outgoing webhooks are HMAC-signed with a timestamp.

### Content and files

- Email previews render in a sandboxed iframe with no scripts.
- The merge-tag language cannot execute code, and Contact values are HTML-escaped.
- Uploads are images only, size-limited, sniffed for type, with SVG blocked. They're served with `Content-Disposition` and `nosniff`.
- CSV imports are size-limited and streamed. CSV exports escape cells starting with `=`, `+`, `-` or `@`.

### Secrets and personal data

- Provider credentials are encrypted with AES-GCM and a versioned key for rotation. They are write-only in the API and held as Effect `Redacted` values so they never reach logs.
- Logs never contain email addresses or message content.
- Delivery events reference Contacts by ID. Deleting a Contact anonymizes their history.

### Transport and headers

HSTS, a strict CSP on the dashboard, `frame-ancestors 'none'`, Referrer-Policy, and CORS restricted to the dashboard origin.

### Resource limits

- Request body size limits, maximum page sizes, import size limits.
- Postgres `statement_timeout`.
- Hosted runs behind Cloudflare.

### Visibility

- **Security event log (core, 90 days, visible to owners):** sign-ins, failed sign-ins, 2FA changes, API key and Provider Connection changes, exports, role changes.
- The full audit log of every change is an `ee/` feature (P4).

### Supply chain and release

- Exact version pins in one pnpm catalog, and a `minimumReleaseAge` of 7 days.
- Renovate opens grouped weekly update PRs, each reviewed by a person.
- CI runs `pnpm audit`, CodeQL and secret scanning.
- Docker images use a minimal base and a non-root user, and are published with an SBOM and a cosign signature.
- GitHub private vulnerability reporting is on and linked from `SECURITY.md`.

## Verification

- OWASP ASVS Level 2 checklist, reviewed at the end of each phase.
- CI security suites: tenant isolation, token tampering, rate limits, SSRF blocking, Better Auth endpoints outside the allow list.
- A security review on every pull request that touches authentication, public endpoints or outbound requests.
- A paid external penetration test once paid revenue can cover it (P4).
