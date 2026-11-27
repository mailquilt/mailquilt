import { Schema } from "effect";

import { ContactEmail } from "./contact.ts";
import { SuppressionIdSchema } from "./ids.ts";

/**
 * Why an address is Suppressed: a hard bounce, a third soft bounce within
 * 7 days, a spam complaint, or a member adding it by hand (`manual`), on
 * its own or from a CSV file.
 */
export const SuppressionReasonSchema = Schema.Literals([
  "hard-bounce",
  "soft-bounce",
  "complaint",
  "manual",
]);

export type SuppressionReason = typeof SuppressionReasonSchema.Type;

/**
 * An Organization-wide block on one email address, compared without regard
 * to case. No Campaign is sent to it, whatever its Subscriptions say.
 */
export class Suppression extends Schema.Class<Suppression>("Suppression")({
  id: SuppressionIdSchema,
  email: ContactEmail,
  reason: SuppressionReasonSchema,
  createdAt: Schema.DateTimeUtc,
}) {}
