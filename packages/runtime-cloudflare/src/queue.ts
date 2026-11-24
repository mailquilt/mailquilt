import { handleQueueMessage, Queue, QueueMessageSchema } from "@repo/core";
import { forwardQueueOutbox, QueueOutboxLive } from "@repo/db";
import { Cause, Effect, Layer, Ref, Schema } from "effect";

import type { QueueBinding } from "./queue-binding.ts";

/**
 * Moves every message in the outbox to Cloudflare Queues. A message stays in
 * the outbox until Cloudflare took it.
 */
export const forwardOutboxTo = (binding: QueueBinding) =>
  forwardQueueOutbox((messages) =>
    Effect.tryPromise(() =>
      binding.sendBatch(messages.map((body) => ({ body })))
    )
  );

/**
 * The Queue on Workers, for one request. Cloudflare Queues can't join a
 * Postgres transaction, so `enqueue` writes to the outbox in it (ADR 0014),
 * and once the request is done, while its database connection is still
 * open, a request that queued anything forwards the outbox. If that fails,
 * the messages wait for the next forward, which a Cron Trigger runs every
 * minute.
 */
export const outboxQueueLive = (binding: QueueBinding) =>
  Layer.effect(
    Queue,
    Effect.gen(function* outboxQueue() {
      const outbox = yield* Queue.pipe(Effect.provide(QueueOutboxLive));
      const enqueued = yield* Ref.make(false);

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* forwardWhatThisRequestQueued() {
          if (!(yield* Ref.get(enqueued))) {
            return;
          }

          yield* forwardOutboxTo(binding).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(
                "Queued messages couldn't be forwarded to Cloudflare Queues; the next scheduled forward will try again",
                Cause.pretty(cause)
              )
            )
          );
        })
      );

      return {
        enqueue: (messages) =>
          outbox
            .enqueue(messages)
            .pipe(Effect.andThen(Ref.set(enqueued, true))),
      };
    })
  );

const decodeMessage = Schema.decodeUnknownEffect(QueueMessageSchema);

/**
 * Does the work each message from Cloudflare Queues asks for, one after
 * another, so a batch holds one SMTP connection and one database
 * connection at a time, within a Worker's 6. Each message is acknowledged
 * once its work is done, and retried if it failed. A message that doesn't
 * decode never will, so it's logged and acknowledged.
 */
export const consumeQueueBatch = (batch: {
  readonly messages: readonly Pick<Message, "ack" | "body" | "retry">[];
}) =>
  Effect.forEach(
    batch.messages,
    (message) =>
      decodeMessage(message.body).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.logError(
              "A queue message didn't decode; it was dropped",
              error
            ),
          onSuccess: handleQueueMessage,
        }),
        Effect.matchCauseEffect({
          onFailure: (cause) =>
            Effect.logError(
              "A queue message failed; Cloudflare Queues will deliver it again",
              Cause.pretty(cause)
            ).pipe(Effect.andThen(Effect.sync(() => message.retry()))),
          onSuccess: () => Effect.sync(() => message.ack()),
        })
      ),
    { discard: true }
  );
