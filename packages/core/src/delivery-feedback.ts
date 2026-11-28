import type { CampaignId, ContactId } from "@repo/domain";
import type { DateTime, Effect } from "effect";
import { Context } from "effect";

import type { CurrentOrganization } from "./current-organization.ts";

/**
 * What SES said happened to an email: a bounce SES calls `Permanent` is a
 * hard bounce, one it calls `Transient` or `Undetermined` a soft bounce, and
 * a spam report a complaint.
 */
export type SesFeedbackKind = "hard-bounce" | "soft-bounce" | "complaint";

/**
 * What a delivery status report sent to a bounce address says happened to
 * an email: a hard bounce when the server gave up for good, a soft bounce
 * when it gave up on a failure that might have passed (ADR 0021).
 */
export type BounceKind = Exclude<SesFeedbackKind, "complaint">;

/**
 * One recipient a delivery status report says couldn't be delivered to:
 * how, and the address it names as `Final-Recipient`, the one the reporting
 * server tried, after any alias or forward.
 */
export interface FailedDelivery {
  readonly kind: BounceKind;
  readonly recipient: string;
}

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
    /**
     * Records a bounce to a bounce address, about the Campaign email the
     * Contact was sent, by the same rules as `record`: the failed delivery
     * whose recipient is the address that email went to, compared without
     * regard to case. It's found by its Campaign and Contact, so one whose
     * send was cut off counts too. Says whether it was recorded: not when no
     * failed delivery names that address, such as one member of an alias
     * bouncing, nor when the Campaign or Contact has gone.
     */
    readonly recordBounce: (
      email: { readonly campaignId: CampaignId; readonly contactId: ContactId },
      failed: readonly FailedDelivery[]
    ) => Effect.Effect<boolean, never, CurrentOrganization>;
  }
>()("@repo/core/DeliveryFeedback") {}
