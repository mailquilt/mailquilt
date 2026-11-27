import { PgClient } from "@effect/sql-pg";
import { assert, layer } from "@effect/vitest";
import {
  Queue,
  QueueMessageSchema,
  Scheduler,
  SendCampaignBatch,
  StartScheduledCampaign,
} from "@repo/core";
import type { QueueMessage } from "@repo/core";
import { CampaignIdSchema, OrganizationIdSchema } from "@repo/domain";
import { DateTime, Effect, Layer, Redacted, Ref, Schema } from "effect";

import { Database, DatabaseLive } from "../src/database.ts";
import { migrateDatabase } from "../src/migrate.ts";
import { forwardQueueOutbox, QueueOutboxLive } from "../src/queue-outbox.ts";
import { emptyDatabase, PostgresLive } from "./postgres.ts";

const batch = (number: number) =>
  new SendCampaignBatch({
    batch: number,
    campaignId: CampaignIdSchema.make("cmp_01h455vb4pex5vsknk084sn02q"),
    organizationId: OrganizationIdSchema.make("org_01h455vb4pex5vsknk084sn02q"),
  });

const migratedDatabase = Effect.gen(function* migratedDatabase() {
  const url = yield* emptyDatabase;

  const database = DatabaseLive.pipe(
    Layer.provideMerge(PgClient.layer({ url: Redacted.make(url) }))
  );

  yield* migrateDatabase.pipe(Effect.provide(database));

  return Layer.mergeAll(
    database,
    QueueOutboxLive.pipe(Layer.provide(database))
  );
});

const enqueueIn = (
  outcome: "commits" | "rolls back",
  messages: readonly QueueMessage[]
) =>
  Effect.gen(function* enqueueInTransaction() {
    const db = yield* Database;
    const queue = yield* Queue;

    yield* db
      .transaction(() =>
        Effect.gen(function* enqueueThenFinish() {
          yield* queue.enqueue(messages);

          if (outcome === "rolls back") {
            return yield* Effect.fail("rolled back");
          }
        })
      )
      .pipe(Effect.ignore);
  });

const forwardAll = Effect.gen(function* forwardAll() {
  const forwarded = yield* Ref.make<readonly unknown[]>([]);

  yield* forwardQueueOutbox((messages) =>
    Ref.update(forwarded, (earlier) => [...earlier, ...messages])
  );

  return yield* Ref.get(forwarded);
});

const decodeMessage = Schema.decodeUnknownSync(QueueMessageSchema);

const batchNumbers = (messages: readonly unknown[]) =>
  messages
    .map((message) => decodeMessage(message))
    .flatMap((message) =>
      message._tag === "SendCampaignBatch" ? [message.batch] : []
    )
    .toSorted((a, b) => a - b);

const startAt = (at: DateTime.Utc) =>
  new StartScheduledCampaign({
    at,
    campaignId: CampaignIdSchema.make("cmp_01h455vb4pex5vsknk084sn02q"),
    organizationId: OrganizationIdSchema.make("org_01h455vb4pex5vsknk084sn02q"),
  });

layer(PostgresLive, { timeout: "2 minutes" })("Queue outbox", (test) => {
  test.effect(
    "forwards a message once, and only if the transaction that queued it commits",
    () =>
      Effect.gen(function* committedOnly() {
        const database = yield* migratedDatabase;

        yield* Effect.gen(function* queueAndForward() {
          yield* enqueueIn("rolls back", [batch(0)]);
          yield* enqueueIn("commits", [batch(1), batch(2)]);

          const first = yield* forwardAll;
          const second = yield* forwardAll;

          assert.deepStrictEqual(batchNumbers(first), [1, 2]);
          assert.deepStrictEqual(second, []);
        }).pipe(Effect.provide(database));
      })
  );

  test.effect("keeps the messages a failed forward couldn't hand over", () =>
    Effect.gen(function* failedForward() {
      const database = yield* migratedDatabase;

      yield* Effect.gen(function* forwardFailsThenSucceeds() {
        yield* enqueueIn("commits", [batch(0)]);

        yield* forwardQueueOutbox(() => Effect.fail("queue unavailable")).pipe(
          Effect.flip
        );

        assert.deepStrictEqual(batchNumbers(yield* forwardAll), [0]);
      }).pipe(Effect.provide(database));
    })
  );

  test.effect("forwards more messages than one hand-over takes", () =>
    Effect.gen(function* manyMessages() {
      const database = yield* migratedDatabase;
      const count = 250;

      yield* Effect.gen(function* forwardMany() {
        yield* enqueueIn(
          "commits",
          Array.from({ length: count }, (_, index) => batch(index))
        );

        assert.lengthOf(yield* forwardAll, count);
      }).pipe(Effect.provide(database));
    })
  );

  test.effect(
    "keeps a scheduled message in the outbox until it's due, and forwards it once it is",
    () =>
      Effect.gen(function* scheduledMessages() {
        const database = yield* migratedDatabase;
        const due = DateTime.makeUnsafe("2020-01-01T09:00:00Z");
        const notDue = DateTime.makeUnsafe("2099-12-01T14:00:00Z");

        yield* Effect.gen(function* scheduleAndForward() {
          const scheduler = yield* Scheduler;
          const db = yield* Database;

          yield* db.transaction(() =>
            Effect.gen(function* scheduleBoth() {
              yield* scheduler.schedule(startAt(notDue), notDue);
              yield* scheduler.schedule(startAt(due), due);
            })
          );

          const forwarded = (yield* forwardAll).map((message) =>
            decodeMessage(message)
          );

          assert.deepStrictEqual(forwarded, [startAt(due)]);
          assert.deepStrictEqual(yield* forwardAll, []);
        }).pipe(Effect.provide(database));
      })
  );
});
