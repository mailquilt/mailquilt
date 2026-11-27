import type { DateTime, Effect } from "effect";
import { Context } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";

/**
 * What SES said happened to an email: a bounce SES calls `Permanent` is a
 * hard bounce, one it calls `Transient` or `Undetermined` a soft bounce, and
 * a spam report a complaint.
 */
export type SesFeedbackKind = "hard-bounce" | "soft-bounce" | "complaint";

/** One bounce or complaint, about the email SES gave `providerMessageId`. */
export interface SesFeedback {
  readonly kind: SesFeedbackKind;
  readonly providerMessageId: string;
}

/** An SNS message that has been checked, kept until `expiresAt` so a second copy is known. */
export interface ReceivedSnsMessage {
  readonly id: string;
  readonly expiresAt: DateTime.Utc;
}

/**
 * Port: records the bounces and complaints a Provider reports, in the
 * Organization its webhook names.
 */
export class DeliveryFeedback extends Context.Service<
  DeliveryFeedback,
  {
    /**
     * Records `feedback` once per SNS message: a message already recorded
     * changes nothing. Feedback about an email this Organization sent
     * records its delivery event and, by the Suppression rules, Suppresses
     * the address it went to; about any other email, it's ignored.
     */
    readonly record: (
      message: ReceivedSnsMessage,
      feedback: SesFeedback
    ) => Effect.Effect<void, never, CurrentOrganization>;
  }
>()("@repo/core/DeliveryFeedback") {}
