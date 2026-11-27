# Use cases send through a Provider Connection with one function

Each Provider has its own port in `core`, such as `SmtpProvider`, and each runtime provides the adapters that run on it (ADR 0002, ADR 0003). A use case that sends through a Provider Connection doesn't call a port itself. It calls `sendThrough(connection, email)` (`packages/core/src/provider.ts`), which picks the adapter for the connection's Provider and passes it that connection's settings and opened credentials. Sending a Campaign's batches and sending a test email both use it.

A Provider Connection is SMTP or SES (#18), and `sendThrough` calls `SmtpProvider` or `SesProvider` for it. Cloudflare Email (#20) is P1 too. Each adds a kind to the Provider Connection, a port and adapter, and one case in `sendThrough`; the use cases that send don't change. Before this, both use cases read `SmtpProvider` and built its settings themselves, so each new Provider would have changed both, and every later use case that sends.

The port has only `send`. It also had `parseNotifications`, for Provider webhooks, with three types and a stub in every adapter, but nothing called it. Provider events (#19, #21) add notification parsing back, designed with the endpoint that receives them.

The System Mailer isn't a Provider Connection. It sends Mailquilt's own account emails through `SmtpProvider` directly, with the install's settings (ADR 0002).

## Considered Options

- **A port per use case** that the runtime fills with the right adapter: moves the choice out of `core`, but the choice is a rule about Provider Connections, which belongs in `core`, and every runtime would repeat it.
- **One `Provider` service with a method per Provider:** a runtime couldn't leave out a Provider it can't run without a stub that fails, and every test would have to provide every Provider.
- **Keeping `parseNotifications` for #19:** its shape was guessed before any webhook was built, and three stubs had to answer it.

## Consequences

- A use case that sends through a Provider Connection calls `sendThrough`, never a Provider port.
- A new Provider adds its port to `sendThrough`'s requirements, so each runtime and the API test harness must provide it, or the build fails.
