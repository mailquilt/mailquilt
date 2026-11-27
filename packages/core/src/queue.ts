import { Context, Effect, Schema } from "effect";

import { CurrentOrganization } from "./current-organization.ts";
import { SendCampaignBatch } from "./send-campaign-batch.ts";
import { StartScheduledCampaign } from "./start-scheduled-campaign.ts";

/**
 * Work the app sends itself to do later, outside the request that asked for
 * it. Every message names the Organization it acts in. Messages are JSON on
 * the wire, so each runtime decodes them with this schema.
 */
export const QueueMessageSchema = Schema.Union([
  SendCampaignBatch,
  StartScheduledCampaign,
]);

export type QueueMessage = typeof QueueMessageSchema.Type;

/**
 * How many times a message whose work failed is delivered again, such as
 * while Postgres is briefly unreachable, before the queue gives up on it.
 */
export const QUEUE_RETRIES = 5;

/**
 * How long the queue waits before the first retry. Each later retry waits
 * twice as long, so the retries span about 15 minutes of outage. pg-boss, on
 * Node, adds jitter: each wait falls between this schedule and twice it,
 * capped at the last retry's wait.
 */
export const QUEUE_RETRY_DELAY_SECONDS = 30;

/** How long to wait before delivering a message again after its `attempt`-th delivery failed, counting from 1. */
export const queueRetryDelaySeconds = (attempt: number) =>
  QUEUE_RETRY_DELAY_SECONDS * 2 ** (attempt - 1);

/**
 * Port: hands messages to the runtime's queue, which delivers each at least
 * once to `handleQueueMessage`, possibly in another process. The messages
 * join the database transaction `enqueue` runs in, so they're delivered only
 * if it commits: on Node through pg-boss, on Workers through an outbox table
 * (ADR 0014). A queue that can't take them is a defect.
 */
export class Queue extends Context.Service<
  Queue,
  {
    readonly enqueue: (
      messages: readonly QueueMessage[]
    ) => Effect.Effect<void>;
  }
>()("@repo/core/Queue") {}

/**
 * Runs `effect` in the Organization a queue message names. Only the app
 * sends queue messages, from work that already acted in that Organization,
 * so the message is trusted as the request that sent it was (ADR 0014).
 */
export const asQueuedFor =
  (message: QueueMessage) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(CurrentOrganization, {
        id: message.organizationId,
      })
    );
