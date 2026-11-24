import { Queue, QueueMessageSchema } from "@repo/core";
import { sql } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";

import { Database } from "./database.ts";
import { queueOutbox } from "./schema.ts";

/** A queue message as JSON, the way it's stored and handed on. */
export type EncodedQueueMessage = typeof QueueMessageSchema.Encoded;

const MESSAGES_PER_SEND = 100;

const encodeMessages = Schema.encodeEffect(Schema.Array(QueueMessageSchema));

/**
 * The Queue for a runtime whose queue can't join a Postgres transaction, such
 * as Cloudflare Queues: `enqueue` writes the messages to the outbox through
 * the app's database, so they join the transaction it runs in and exist only
 * if it commits. `forwardQueueOutbox` hands them to the real queue (ADR 0014).
 */
export const QueueOutboxLive = Layer.effect(
  Queue,
  Effect.gen(function* queueOutboxLive() {
    const db = yield* Database;

    return {
      enqueue: (messages) =>
        Effect.gen(function* enqueue() {
          if (messages.length === 0) {
            return;
          }

          const encoded = yield* encodeMessages(messages);

          yield* db
            .insert(queueOutbox)
            .values(encoded.map((message) => ({ message })));
        }).pipe(Effect.orDie),
    };
  })
);

const forwardGroup = <E, R>(
  send: (messages: readonly EncodedQueueMessage[]) => Effect.Effect<void, E, R>
) =>
  Effect.gen(function* forwardOneGroup() {
    const db = yield* Database;

    return yield* db.transaction(() =>
      Effect.gen(function* takeAndSend() {
        const taken = yield* db
          .execute<{ readonly message: EncodedQueueMessage }>(sql`
            delete from ${queueOutbox}
            where id in (
              select id from ${queueOutbox}
              order by id
              limit ${MESSAGES_PER_SEND}
              for update skip locked
            )
            returning message
          `)
          .pipe(Effect.orDie);

        const messages = taken.rows.map((row) => row.message);

        if (messages.length > 0) {
          yield* send(messages);
        }

        return messages.length;
      })
    );
  });

/**
 * Hands every message in the outbox to `send`, up to 100 at a time (the most
 * Cloudflare Queues takes in one batch), deleting each group in the
 * transaction that sends it: a group `send` fails on stays for the next
 * forward, and stops this one. Messages another forward is
 * sending are skipped, so two forwards never hand over the same one. A group
 * sent just before its delete fails to commit is sent again next time; the
 * queue delivers at least once anyway. Fails with `send`'s error, or the
 * database's.
 */
export const forwardQueueOutbox = <E, R>(
  send: (messages: readonly EncodedQueueMessage[]) => Effect.Effect<void, E, R>
) =>
  Effect.gen(function* forwardEveryGroup() {
    let forwarded = 0;
    let sent = MESSAGES_PER_SEND;

    while (sent === MESSAGES_PER_SEND) {
      sent = yield* forwardGroup(send);
      forwarded += sent;
    }

    return forwarded;
  });
