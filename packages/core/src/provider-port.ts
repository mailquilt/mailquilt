import type { SendFailed, Sender } from "@repo/domain";
import type { Effect } from "effect";

import type { SendDeferred } from "./send-deferred.ts";

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
 * Connection's settings, failing with `SendDeferred` when it can be tried
 * again later and `SendFailed` when it can't. Each Provider is its own port, such as
 * `SmtpProvider`, so each runtime provides the adapters that run on it. Use
 * cases don't call one directly: they send with `sendThrough` (ADR 0015).
 * The notifications a Provider sends back are read by a port of their own,
 * such as `SesNotifications`.
 */
export interface Provider<Settings> {
  readonly send: (
    settings: Settings,
    email: OutgoingEmail
  ) => Effect.Effect<SentEmail, SendFailed | SendDeferred>;
}
