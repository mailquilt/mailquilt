import { Schema } from "effect";

import { SubscriptionIdSchema } from "./ids.ts";
import { Subscription } from "./subscription.ts";

/**
 * One page of a List's Subscriptions, newest first. `next` is the cursor for
 * the following page, or null on the last one (ADR 0008).
 */
export class SubscriptionPage extends Schema.Class<SubscriptionPage>(
  "SubscriptionPage"
)({
  subscriptions: Schema.Array(Subscription),
  next: Schema.NullOr(SubscriptionIdSchema),
}) {}
