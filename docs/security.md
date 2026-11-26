# Security

Mailquilt's threat model and the controls that answer it. Each control ships in the same phase as the feature it protects (see [ROADMAP.md](../ROADMAP.md)). The verification checklist is **OWASP ASVS Level 2**. Capitalized terms are defined in [GLOSSARY.md](../GLOSSARY.md).

A control marked **planned** isn't built yet and names the issue that builds it. Everything else is in place today.

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
- **Sign-in methods:** email and password. Email verification is required. Planned (#32): the Have I Been Pwned leaked-password check, magic link, Google and GitHub.
- **Two-factor sign-in** (planned, #33): optional in P1 (authenticator app plus backup codes). Organizations can require it from P2.
- **Responses don't reveal whether an account exists.**
- **Cookies:** httpOnly, Secure, SameSite=Lax. Better Auth's origin and CSRF checks are pinned on, because Better Auth turns both off when `NODE_ENV` is `test` or `TEST` is set, and `trustedOrigins` is explicit. API tests show a signed-in change from another site, such as a sign-out, is refused, and so is a sign-in that would send the person to another site (#155).
- **Sessions** (planned, #32): members see their active sessions and can sign each one out.
- **Client IP header** is set explicitly: `cf-connecting-ip` on Cloudflare, the reverse proxy's header (`CLIENT_IP_HEADER`) on Docker, and the directly connected peer when Docker has no proxy. The default `x-forwarded-for` can be forged by clients, so Better Auth never reads it.
- **Re-confirmation** (planned, #35): sensitive actions need a sign-in within the last 10 minutes, and Organization owners get an email:
  - adding or changing a Provider Connection
  - creating an API key
  - exporting Contacts
  - inviting a member or changing a role
  - turning off 2FA
  - deleting the Organization
- **Hosted** (planned, #38): Turnstile on sign-up and sign-in.
- **Self-hosted:** invite-only by default; a first-run wizard creates the instance admin.

### Authorization and tenant isolation

- Every endpoint declares the role it needs (planned, #34). Until then, every member of an Organization can do everything in it.
- Every endpoint for one Organization's data names it in the path and checks the caller's membership on every request. A non-member gets the same 404 as for an Organization that doesn't exist ([ADR 0007](adr/0007-tenant-endpoints-name-the-organization-in-the-path.md)).
- Every repository method for tenant data requires the Organization from the request context.
- A CI test suite attempts cross-Organization reads and writes, and fails when an endpoint for one Organization's data has no case in it.
- A write that uses the session cookie is refused when its `Origin` is another site.
- **API keys** (planned, #37):
  - shown once and stored as a hash
  - `mq_` prefix, so GitHub secret scanning catches leaks
  - scoped, with last-used time and revocation
  - not usable from browsers (no CORS)

### Rate limiting

One `RateLimiter` port is used everywhere, including by Better Auth through its custom storage. Better Auth's default in-memory store is never used, and limits are on in every environment.

| Key | Applies to | Default (tunable) | Status |
| --- | --- | --- | --- |
| IP | Sign-in | 5 per minute | Built |
| Account | Sign-in | 20 per hour | Built |
| User | Test emails through a Provider Connection | 10 per 10 minutes | Built |
| Email address | Password reset, magic link | 3 per hour | Planned, #32 |
| IP | Public signup form | 10 per minute | Planned, #30 |
| API key | Public API | 600 per minute | Planned, #37 |
| User | Dashboard API | Generous; stops runaway clients | Planned, #153 |
| Organization | Imports and sending | Bounded by plan fair use and the Provider's sending limit | Planned, #18, #153 |

Backends are listed in [architecture.md](architecture.md#deployment-targets).

### Public endpoints

- **Signed tokens:** a link in an email carries a token signed with HMAC-SHA-256 under a key derived from `ENCRYPTION_KEYS` for its purpose, so it rotates with that setting (ADR 0016). Its payload holds IDs only, never an address, and IDs aren't sequential. Unsubscribe links use it now (#12); preference, tracking and bounce (VERP) tokens will (#13, #21, #23).
- **Unsubscribe pages** send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and a Content Security Policy that loads nothing from elsewhere, because the token is in the address. They escape every value they show.

Planned, with the features they protect.

- **Click redirects** (#23) go only to the URL inside the signed token, so they can't be used as open redirects.
- **Signup forms** (#30):
  - Turnstile, with hCaptcha as an alternative from P2. No reCAPTCHA.
  - A honeypot field when no captcha is configured.
  - Double opt-in on by default on hosted.
- **Separate public domain on hosted** (#38): public pages are served from a domain that never receives cookies. On a single-domain self-host, archive pages are sent with `Content-Security-Policy: sandbox`.
- **"Report abuse"** (#38) link on hosted public pages; a super-admin can suspend an Organization.

### Incoming webhooks

Planned, with the first Provider that sends them (#19).

- Every Provider's signature is verified. The SNS signing certificate URL must be HTTPS on an `amazonaws.com` host.
- Replay protection: timestamps and message-ID deduplication.
- Processing is idempotent.

### Outbound requests (SSRF)

All of these go through one outbound guard:

- SMTP hosts
- planned, as each is built: outgoing webhooks, RSS fetches, image import from a URL (#25), SNS certificate fetches (#19)

The guard blocks private, link-local, loopback and cloud metadata addresses. It checks every address after DNS resolution, and the connection goes to the address it checked, so a second DNS answer can't redirect it ([ADR 0010](adr/0010-outbound-connections-go-to-the-address-the-guard-checked.md)). On Workers, SMTP connects by name after the check, because Cloudflare starts TLS only on a socket opened by name; a deployed Worker reaches only the public internet (`wrangler dev` can reach the local network), so a second answer can't lead anywhere the check would have refused. It limits how long a connection may take; HTTP fetches, once there are any, also get limits on redirects and response size.

- **Hosted** (planned, #38): always on.
- **Self-hosted:** private networks and loopback are allowed by default (internal SMTP relays are normal), and `BLOCK_PRIVATE_NETWORKS=true` turns the block on. Cloud metadata, link-local and reserved addresses are refused either way.

Outgoing webhooks, once built, are HMAC-signed with a timestamp.

### Content and files

- Email previews render in a sandboxed iframe with no scripts.
- The merge-tag language cannot execute code, and Contact values are HTML-escaped (planned, #26).
- Uploads are images only, size-limited, sniffed for type, with SVG blocked. They're served with `Content-Disposition` and `nosniff` (planned, #25).
- CSV imports are size-limited and streamed (planned, #28). CSV exports escape cells starting with `=`, `+`, `-` or `@` (planned, #36).

### Secrets and personal data

- Saved Provider credentials go only to the server they were entered for: changing a connection's host, port or encryption needs them entered again.
- Provider credentials are encrypted with AES-256-GCM under a versioned key from `ENCRYPTION_KEYS`, bound to their row so a copied value doesn't open elsewhere ([ADR 0009](adr/0009-secrets-are-sealed-under-versioned-keys-bound-to-their-row.md)). They are write-only in the API and held as Effect `Redacted` values so they never reach logs.
- Logs never contain email addresses or message content.
- Delivery events reference Contacts by ID. Deleting a Contact will anonymize their history; Contacts can't be deleted yet.

### Transport and headers

Planned (#38): HSTS, a strict CSP on the dashboard, `frame-ancestors 'none'` and Referrer-Policy. Neither app sends them yet. Neither sends CORS headers, so other origins can't read API responses.

### Resource limits

- Request body size limits and maximum page sizes. Import size limits are planned (#28).
- Postgres `statement_timeout` (planned, #154).
- Hosted runs behind Cloudflare (planned, #38).

### Visibility

- **Security event log** (planned, #35; core, 90 days, visible to owners): sign-ins, failed sign-ins, 2FA changes, API key and Provider Connection changes, exports, role changes.
- The full audit log of every change is an `ee/` feature (P4).

### Supply chain and release

- Exact version pins in one pnpm catalog, and a `minimumReleaseAge` of 7 days.
- Dependencies are updated deliberately by hand. Dependabot alerts and `pnpm audit` in CI flag vulnerable versions.
- CI runs `pnpm audit`, CodeQL and secret scanning.
- The Docker image uses a minimal base and a non-root user. Publishing it, with an SBOM and a cosign signature, is planned (#39).
- GitHub private vulnerability reporting is on and linked from `SECURITY.md`.

## Verification

- OWASP ASVS Level 2 checklist, reviewed at the end of each phase (P1's is #42).
- CI security suites: tenant isolation, rate limits, SSRF blocking, Better Auth endpoints outside the allow list. Token tampering comes with the first signed token (#12).
- A security review on every pull request that touches authentication, public endpoints or outbound requests.
- A paid external penetration test once paid revenue can cover it (P4).
