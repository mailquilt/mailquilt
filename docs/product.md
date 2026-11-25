# Mailquilt product

What Mailquilt is, who it's for, how it makes money, and what it deliberately won't do. Capitalized terms (Contact, List, Campaign…) are defined in [GLOSSARY.md](../GLOSSARY.md). The feature plan is in [ROADMAP.md](../ROADMAP.md).

## Positioning

> **Email marketing with the polish of Kit and Mailchimp, for one flat price, sending through your own provider. Open source: self-host it free, or let us run it.**

Three pillars:

1. **Polish.** The UI and UX match the paid tools. Most open-source email tools lose here.
2. **Freedom.** Any Provider (SES, SMTP, Cloudflare Email, Resend, Postmark…), any host (Cloudflare or Docker), AGPL source code, data that can always be exported.
3. **One flat price.** No per-contact pricing and no feature tiers. Customers pay their Provider's wholesale rate directly, plus a flat app fee.

Mailquilt never sends an Organization's email itself; see [ADR 0002](adr/0002-customers-bring-their-own-provider.md).

## Customers

|  | Who | Why they switch |
| --- | --- | --- |
| **Primary** | Small businesses, indie SaaS and creators sending 10k–5M emails a month who care about cost | Per-contact pricing at Kit, Mailchimp, Beehiiv and Resend gets expensive as lists grow. Mailquilt costs a flat fee plus Provider cost |
| **Secondary** | Agencies running email for several clients | One install or account for many Organizations, white-label, flat pricing |
| **Served, not targeted** | Developers sending Transactional Messages | Same API and Templates, but Resend and Postmark own this space |
| **Not for** | Very small lists (under about 5k Contacts) that fit the free tiers elsewhere | Self-hosting is their free option |

## Scope

**In:** Campaigns, Automations, Transactional Messages, Lists, Subscriptions, Tags, Segments, signup forms, preference center, web archive, analytics, deliverability tooling, a public API, outbound webhooks, Integrations, an MCP server.

**Out, on purpose:**

- **Managed sending.** We never operate sending infrastructure ([ADR 0002](adr/0002-customers-bring-their-own-provider.md)).
- **Creator monetization** (paid subscriptions, referral programs, ad networks). Not planned for P1–P4. Revisit after the paid launch if creators adopt Mailquilt.
- **Databases other than Postgres** ([ADR 0001](adr/0001-postgres-only.md)).

## Competitive landscape

Researched 2026-11-21. Prices change often, so check before quoting them publicly.

| Product | License / model | Sending | Where Mailquilt wins |
| --- | --- | --- | --- |
| Sendy | Proprietary, $69 one-time | Bring your own (SES and others) | Modern UI, automations, any Provider, hosted option, open source |
| listmonk | AGPL, free, no cloud | Bring your own SMTP | Automations, visual editor, Provider-aware bounce handling, hosted option |
| useSend | AGPL + cloud | SES only | Any Provider, full marketing suite |
| Plunk | AGPL + cloud | SES only | Any Provider, plain-text and suppression features users ask for |
| Keila | AGPL + cloud (€8–€256) | Own or bring your own | Automations, flat price |
| Notifuse | BSL (source-available) + cloud | Bring your own | Real open source |
| Mautic | GPL | Bring your own | Much lighter to run, modern UX |
| Ghost (newsletters) | MIT + Ghost(Pro) | Mailgun only | Any Provider |
| Mailchimp, Kit, Beehiiv, MailerLite | Proprietary, per contact, raised prices in 2025–26 | Own infrastructure | 4–10× cheaper at scale, portable data |
| Resend Broadcasts, Loops | Proprietary, per contact | Own infrastructure | Flat price, self-hostable |

**Where nobody is strong today, and Mailquilt aims to be:**

- Automations in an open-source tool. This is the top request on listmonk, Keila and useSend.
- A real choice of Provider, with bounce and complaint handling built per Provider, Cloudflare Email support, and optional failover.
- Checking a sender against the Gmail, Yahoo and Microsoft rules before every Campaign.
- Importers from Mailchimp, Kit, Substack, Sendy and listmonk.

## Pricing (hosted)

| Plan | Price (placeholder) | Includes |
| --- | --- | --- |
| **Pro** | ~$29/mo per Organization | Unlimited Contacts and emails, every core feature |
| **Agency** | ~$99/mo | Unlimited Organizations, white-label |

- Annual billing gets 2 months free.
- 14-day trial. No free hosted tier, because self-hosting is the free tier.
- **No lifetime deals.** Every hosted send keeps costing compute and storage.
- **Fair use:** above about 5M emails a month, we talk.
- No core feature is ever gated by plan.
- Customers pay their Provider directly; email cost never appears on a Mailquilt invoice.
- Billing goes through **Creem** as Merchant of Record (it handles VAT and taxes worldwide), with **Paddle** as the fallback.

## Self-hosting and licensing

- **Core: AGPL-3.0.** Anyone may use, modify and self-host it, including commercially. Anyone who modifies it and offers it to others over a network must share their changes under AGPL.
- **Self-hosting the full core needs no license key.**
- **`ee/` folder: commercial license (P4).** It covers white-label, SSO/SAML, the full audit log, advanced roles, the approval workflow, and priority support.
  - Business license: about **$299 a year per instance**, or about **$999 a year for agencies**. Annual, because updates and support cost money every year.
  - Keys are issued and checked through the Merchant of Record, with a generous offline grace period.
- **CLA:** contributors keep their copyright but grant Mailquilt the right to relicense their contributions. It's enforced by the CLA Assistant bot on every pull request, and it keeps an AGPL exemption available to sell later.
- **Trademark:** no registration for now. `TRADEMARK.md` ships at launch (forks must rename; the name and logo aren't covered by AGPL). Filing in India (classes 9 and 42, about ₹9,000) is optional once hosted earns money. Other countries only if revenue there justifies it.

## Data policy

The policy P1 ships with. Not built yet: deleting raw events after their window (#22), the security event log (#35), and the update check (#40).

| Data | Kept |
| --- | --- |
| Contacts, Lists, Templates, Campaigns, Campaign statistics, each Contact's engagement summary | As long as the plan is paid |
| Raw delivery events per recipient (delivered, opened, clicked…) | 13 months, then deleted. Self-hosters set their own window, including "forever" |
| Everything, after a hosted plan is cancelled | 30 days, read-only with export, then permanently deleted |
| Security event log | 90 days |

- Events reference Contacts by ID, never by email address.
- Self-hosted installs send **no telemetry**. The only call home is an update check, which an environment variable turns off. OpenTelemetry export happens only to an endpoint the admin configures.
- **Paid launch:** a GDPR data processing agreement (DPA) and a public subprocessor list.
- **Hosted beta onward:** Terms of Service, Privacy Policy and an Acceptable Use Policy.

## Launch sequence

1. **End of P1:** open-source release, plus a **free hosted beta** for invited users who send real Campaigns.
2. **End of P2:** **paid hosted launch**, once Mailquilt can genuinely replace Sendy or listmonk, importers included.
3. **P3:** Automations, the Kit and Mailchimp replacement.
4. **P4:** `ee/` features and the self-host Business license.

## Open decisions

- **Where the hosted service runs.** Cloudflare (Workers, Queues, R2, Hyperdrive and managed Postgres) or your own servers. Decide after comparing real costs; the architecture supports both.
- **Automation vocabulary** (Trigger, Step, Event). Settle during P3 planning.
- **Exact prices.** The figures above are placeholders.
