import type { SesAccount, SesCredentials } from "@repo/domain";
import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { Provider } from "./provider-port.ts";

/** Which SES account an SES Provider Connection sends through, and its access key. */
export interface SesSettings {
  readonly account: typeof SesAccount.Type;
  readonly credentials: typeof SesCredentials.Type;
}

/**
 * Port: sends through Amazon SES, and reads the account's sending limit.
 * Its bounces and complaints come back through SNS (`SesNotifications`).
 */
export class SesProvider extends Context.Service<
  SesProvider,
  Provider<SesSettings> & {
    /**
     * The account's sending limit in its Region, in emails a second, or
     * `None` when it can't be read, such as when the access key may send but
     * not call `ses:GetAccount`.
     */
    readonly maxSendRate: (
      settings: SesSettings
    ) => Effect.Effect<Option.Option<number>>;
  }
>()("@repo/core/SesProvider") {}
