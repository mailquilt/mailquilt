import { Context } from "effect";
import type { Effect } from "effect";

import type { FailedDelivery } from "./delivery-feedback.ts";

/**
 * Port: reads an email sent to a bounce address. Only a delivery status
 * report (RFC 3464) saying delivery failed is a bounce: it gives each
 * recipient whose delivery failed, with whom the report names. Anything
 * else, such as an auto-reply or a report that delivery is only delayed,
 * gives none.
 */
export class BounceReports extends Context.Service<
  BounceReports,
  {
    readonly read: (
      raw: Uint8Array
    ) => Effect.Effect<readonly FailedDelivery[]>;
  }
>()("@repo/core/BounceReports") {}
