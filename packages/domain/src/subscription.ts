import { Schema } from "effect";

import { Contact } from "./contact.ts";
import { SubscriptionIdSchema } from "./ids.ts";

/**
 * Whether a Contact receives Campaigns sent to a List. Only `subscribed`
 * does; `pending` is waiting for double opt-in confirmation.
 */
export const SubscriptionStatusSchema = Schema.Literals([
  "pending",
  "subscribed",
  "unsubscribed",
]);

export type SubscriptionStatus = typeof SubscriptionStatusSchema.Type;

/** A Contact's Subscription to one List, with its status. */
export class Subscription extends Schema.Class<Subscription>("Subscription")({
  id: SubscriptionIdSchema,
  contact: Contact,
  status: SubscriptionStatusSchema,
}) {}
