import { Context, Effect, Schema } from "effect";

import { CurrentOrganization } from "./current-organization.ts";
import { SendCampaignBatch } from "./send-campaign-batch.ts";

/**
 * Work the app sends itself to do later, outside the request that asked for
 * it. Every message names the Organization it acts in. Messages are JSON on
 * the wire, so each runtime decodes them with this schema.
 */
export const QueueMessageSchema = Schema.Union([SendCampaignBatch]);

export type QueueMessage = typeof QueueMessageSchema.Type;

/**
 * Port: hands messages to the runtime's queue, which delivers each at least
 * once to `handleQueueMessage`, possibly in another process. On Node the
 * messages join the database transaction `enqueue` runs in, so they're
 * delivered only if it commits. A queue that can't take them is a defect.
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
