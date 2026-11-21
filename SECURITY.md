# Security policy

## Reporting a vulnerability

Report it privately through [GitHub private vulnerability reporting](https://github.com/mailquilt/mailquilt/security/advisories/new). Don't open a public issue, pull request or discussion about it.

Please include:

- what an attacker can do, and what they need first (an account, a role, a network position)
- the steps to reproduce it, or a proof of concept
- the version or commit you tested, and whether it was on Cloudflare or Docker

Only the maintainers can see the report. We reply in the report's thread, work on the fix in a private fork, and publish a GitHub security advisory with the release that fixes it. We credit you in the advisory unless you'd rather we didn't.

## Supported versions

Mailquilt hasn't had its first release yet. Until then, fixes land only on `main`. After it, the latest release gets security fixes.

## What we protect

The threat model and the controls that answer it are in [docs/security.md](docs/security.md). A report doesn't have to fit it; tell us whatever you find.

Problems with a customer's own Provider account, such as their SES or SMTP settings, are outside Mailquilt. Report those to the Provider.
