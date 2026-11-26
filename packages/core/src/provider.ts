import type {
  ProviderConnection,
  SendFailed,
  Sender,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { Context, Effect } from "effect";
import type { Option } from "effect";

/**
 * One email to hand to a Provider: its plain text, its HTML, or both, where
 * replies go when that isn't the sender, and any headers of its own, such as
 * `List-Unsubscribe`.
 */
export interface OutgoingEmail {
  readonly from: typeof Sender.Type;
  readonly to: string;
  readonly replyTo?: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** An email the Provider accepted, with the ID it gave the message. */
export interface SentEmail {
  readonly messageId: string;
}

/**
 * What every Provider adapter does: send one email with a Provider
 * Connection's settings. Each Provider is its own port, such as
 * `SmtpProvider`, so each runtime provides the adapters that run on it. Use
 * cases don't call one directly: they send with `sendThrough` (ADR 0015).
 * Reading the notifications a Provider sends back joins the port with
 * Provider events (#19, #21).
 */
export interface Provider<Settings> {
  readonly send: (
    settings: Settings,
    email: OutgoingEmail
  ) => Effect.Effect<SentEmail, SendFailed>;
}

/** Where an SMTP Provider Connection sends, and what it signs in with, if anything. */
export interface SmtpSettings {
  readonly server: typeof SmtpServer.Type;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
}

/**
 * Port: sends through an SMTP server. SMTP has no webhooks; bounces come back
 * to the bounce address instead.
 */
export class SmtpProvider extends Context.Service<
  SmtpProvider,
  Provider<SmtpSettings>
>()("@repo/core/SmtpProvider") {}

/** A Provider Connection with its credentials opened, for sending only. */
export interface ProviderConnectionWithCredentials {
  readonly connection: ProviderConnection;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
}

/**
 * Sends one email through a Provider Connection, with the adapter for its
 * Provider. This is the one place that picks an adapter for a connection, so
 * a new Provider, such as SES (#18) or Cloudflare Email (#20), adds its case
 * here and the use cases that send don't change (ADR 0015). Every Provider
 * Connection is SMTP today.
 */
export const sendThrough = (
  { connection, credentials }: ProviderConnectionWithCredentials,
  email: OutgoingEmail
) =>
  SmtpProvider.pipe(
    Effect.flatMap((smtp) =>
      smtp.send({ credentials, server: connection.smtp }, email)
    )
  );
