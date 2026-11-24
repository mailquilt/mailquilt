import type {
  SendFailed,
  Sender,
  SmtpCredentials,
  SmtpServer,
} from "@repo/domain";
import { Context } from "effect";
import type { DateTime, Effect, Option } from "effect";

import type { InvalidNotification } from "./invalid-notification.ts";

/**
 * One email to hand to a Provider: its plain text, its HTML, or both, and
 * where replies go when that isn't the sender.
 */
export interface OutgoingEmail {
  readonly from: typeof Sender.Type;
  readonly to: string;
  readonly replyTo?: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
}

/** An email the Provider accepted, with the ID it gave the message. */
export interface SentEmail {
  readonly messageId: string;
}

/** What a Provider reported back about an email it sent. */
export interface DeliveryNotification {
  readonly kind: "delivered" | "hard-bounce" | "soft-bounce" | "complaint";
  readonly messageId: string;
  readonly recipient: string;
  readonly at: DateTime.Utc;
}

/** A webhook request from a Provider, as received. */
export interface NotificationRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * What every Provider adapter does: send one email with a Provider
 * Connection's settings, and read the notifications the Provider sends back.
 * Each Provider is its own port, such as `SmtpProvider`, so each runtime
 * provides the adapters that run on it.
 */
export interface Provider<Settings> {
  readonly send: (
    settings: Settings,
    email: OutgoingEmail
  ) => Effect.Effect<SentEmail, SendFailed>;
  readonly parseNotifications: (
    request: NotificationRequest
  ) => Effect.Effect<readonly DeliveryNotification[], InvalidNotification>;
}

/** Where an SMTP Provider Connection sends, and what it signs in with, if anything. */
export interface SmtpSettings {
  readonly server: typeof SmtpServer.Type;
  readonly credentials: Option.Option<typeof SmtpCredentials.Type>;
}

/**
 * Port: sends through an SMTP server. SMTP has no webhooks, so it reports no
 * notifications; bounces come back to the bounce address instead.
 */
export class SmtpProvider extends Context.Service<
  SmtpProvider,
  Provider<SmtpSettings>
>()("@repo/core/SmtpProvider") {}
