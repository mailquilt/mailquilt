# A bounce address carries a compact signed token naming the email

A receiving server sends a bounce to an email's envelope sender (`MAIL FROM`, which it writes as `Return-Path`), not to its From address. SES reports its bounces through SNS (ADR 0019), but an SMTP server reports nothing back. So for SMTP, Mailquilt makes each Campaign email's envelope sender an address it can receive at and trust: a bounce address (VERP), one per Contact and Campaign (#21).

A bounce address is `<token>@<bounce domain>`. The bounce domain is `BOUNCE_DOMAIN`, a domain on the install's Cloudflare account whose Email Routing catch-all rule sends every email to the Worker's `email()` handler. Docker has no bounce domain, as it can't receive email until bounce-mailbox polling (P2). An SMTP Provider Connection uses a bounce address only when a member turns it on (`usesBounceAddress`), because:

- the customer's domain no longer passes SPF in alignment for these emails, since SPF checks the envelope sender's domain. The bounce domain's SPF record doesn't list the customers' servers either: Email Routing adds one that allows only Cloudflare's own and ends in `~all` (unverified for a subdomain), so these emails get an SPF softfail. DMARC still passes through DKIM, which a Sending Domain must pass (ADR 0020);
- some relays refuse an envelope sender that isn't the signed-in mailbox, and others, such as SES's SMTP interface, replace it with their own, where a bounce address does nothing.

The token is a `SignedTokens` compact token for the purpose `bounce`: `payload-version-tag`, all lowercase letters, digits and hyphens.

- The payload is the 26 characters after the prefix of each of the Organization's, Campaign's and Contact's TypeIDs (ADR 0006), 78 in all. A TypeID's prefix is the same for every ID of its type, so it isn't signed.
- The version is the `ENCRYPTION_KEYS` key version, as in a token (ADR 0016).
- The tag is the first 80 bits of HMAC-SHA-256 over the version and payload, with the key HKDF derives for the purpose (ADR 0016), in lowercase base32 with the TypeID alphabet: 16 characters.

A token is checked in lowercase, so a server that changes an address's case doesn't lose the bounce. It has no expiry: a server can send a bounce days later, and a bounce counts once per email anyway.

The Worker acts on an email only when it's sent to the bounce domain, at an address whose token verifies, and is a delivery status report (RFC 3464) saying delivery failed. It then records a hard or soft bounce for that Campaign and Contact in the token's Organization, as SES's are (ADR 0019): `failed` with a 5.x.x status is a hard bounce, except 5.2.2 (mailbox full) and 5.7.x (refused by policy, such as a block on the sending server); 4.x.x, 5.2.2 or 5.7.x is a soft bounce, since a hard bounce's Suppression can't be removed by hand and a policy block says nothing about whether the address exists. Anything else, such as an auto-reply, a delay report or a plain-text bounce, is ignored. An email over 1 MiB is ignored unread. Nothing is rejected, because a bounce's sender is empty, so a rejection would reach no one.

## Considered Options

- **A `SignedTokens` token as links use (ADR 0016):** about 170 characters of base64url, whose case matters. A server that lowercased the address would lose every bounce, and it's further over the limit below.
- **Matching by the returned Message-ID, unsigned:** no token at all, but the recipient sees their email's Message-ID, so anyone they forward it to could fake its bounce, the reason ADR 0019 refused the same for SES.
- **A random token stored per recipient:** shorter, but a write per email and a column, for what a signature gives without either (ADR 0016).
- **Every SMTP send uses the bounce address once the install has a bounce domain:** no setting, but it changes SPF alignment for every customer, and a relay that refuses the envelope sender would fail every Campaign.
- **A full 256-bit tag:** 52 characters of tag. 80 bits needs 2^79 guesses on average, each an email the Worker must receive, so the extra length buys nothing.

## Consequences

- A bounce address is 97 characters before the `@`, over RFC 5321's 64-character limit for a local part. The IDs alone are 78. Large senders use local parts as long, and receivers deliver to them, but Cloudflare doesn't document a limit for Email Routing (unverified on a deployed Worker).
- The recipient can read their own bounce address in `Return-Path`, so they, or anyone they forward the email to, can make a bounce Suppress that one address. An unsubscribe link in the same email lets them do as much.
- Removing a key version from `ENCRYPTION_KEYS` drops the bounces of every email sent with it, as it breaks its links.
- Nodemailer also takes the Message-ID's domain from the envelope sender, so these emails' Message-IDs end in the bounce domain.
- A bounce is matched by the Campaign and Contact its address names, not by message ID as SES's are, so one about an email whose send was cut off, which has no message ID, still counts. One whose Contact or Campaign has gone is ignored.
- Cloudflare Email (#20) adds its envelope sender in its own adapter; SES ignores the bounce address.
