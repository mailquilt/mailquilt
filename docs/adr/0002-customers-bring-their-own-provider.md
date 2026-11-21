# Customers bring their own sending provider; Mailquilt never sends email itself

Every email, on both self-hosted installs and the hosted service, is delivered through a Provider Connection that the Organization configured with its own credentials (SES, SMTP, Cloudflare Email and others). Mailquilt never operates its own sending infrastructure or resells sending. We chose this over managed sending, which competitors use as a revenue line, because managed sending would make Mailquilt an email provider: it would own abuse review, IP and domain reputation, and account suspensions. That is a separate business a small team can't run. It also keeps the price promise honest, since customers pay their provider's wholesale rate directly.

## Exception: Mailquilt's own system emails

Mailquilt still sends its own account emails (sign-in links, invitations, password resets, billing receipts) through a System Mailer. On the hosted service, that is a provider account Mailquilt owns and uses for nothing else. On a self-hosted install, the admin configures it during setup. The System Mailer never sends an Organization's Campaigns, Automations or Transactional Messages.

## Consequences

- The hosted service charges only for the app; email costs never appear on a Mailquilt invoice.
- Bounce and complaint handling has to be built per Provider, because each Provider reports them differently.
- Proposals to add a "Mailquilt sending" option should be rejected unless this ADR is superseded.
