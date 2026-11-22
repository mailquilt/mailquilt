import { Schema } from "effect";

import { ListIdSchema } from "./ids.ts";

/**
 * Whether a Contact receives Campaigns sent to a List. Only `subscribed`
 * does; `pending` is waiting for double opt-in confirmation.
 */
export const SubscriptionStatusSchema = Schema.Literals([
  "subscribed",
  "pending",
  "unsubscribed",
]);

export type SubscriptionStatus = typeof SubscriptionStatusSchema.Type;

/** A Contact's Subscription to one List: its status, and when it began. */
export class Subscription extends Schema.Class<Subscription>("Subscription")({
  listId: ListIdSchema,
  status: SubscriptionStatusSchema,
  createdAt: Schema.DateTimeUtc,
}) {}
