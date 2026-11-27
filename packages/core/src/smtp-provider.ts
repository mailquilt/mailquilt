import type { SmtpCredentials, SmtpServer } from "@repo/domain";
import { Context } from "effect";
import type { Option } from "effect";

import type { Provider } from "./provider-port.ts";

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
