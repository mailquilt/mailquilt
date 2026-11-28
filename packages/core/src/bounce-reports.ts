import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { BounceKind } from "./delivery-feedback.ts";

/**
 * Port: reads an email sent to a bounce address. Only a delivery status
 * report (RFC 3464) saying delivery failed is a bounce; anything else, such
 * as an auto-reply or a report that delivery is only delayed, is `None`.
 */
export class BounceReports extends Context.Service<
  BounceReports,
  {
    readonly read: (
      raw: Uint8Array
    ) => Effect.Effect<Option.Option<BounceKind>>;
  }
>()("@repo/core/BounceReports") {}
