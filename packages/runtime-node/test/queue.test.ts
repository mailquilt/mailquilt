import { PgClient } from "@effect/sql-pg";
import { assert, layer } from "@effect/vitest";
import {
  Queue,
  QUEUE_RETRIES,
  QUEUE_RETRY_DELAY_SECONDS,
  queueRetryDelaySeconds,
  SEND_BATCH_SIZE,
  SendCampaignBatch,
} from "@repo/core";
import { emptyDatabase, PostgresLive } from "@repo/db/testing";
import { CampaignIdSchema, OrganizationIdSchema } from "@repo/domain";
import { SEND_TIMEOUT_SECONDS } from "@repo/providers/smtp";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { PgBoss, TestClock } from "pg-boss";

import { PgBossLive } from "../src/queue.ts";

const MESSAGES_QUEUE = "mailquilt";

const HEARTBEAT_LAPSED_MS = 31 * 1000;

const RECLAIM_WITHIN_MS = 3 * 60 * 1000;

// WARNING: the batch is claimed with fetch() and never finished, which pg-boss treats as a worker that died holding it: no heartbeat after the claim, no failed job.
const reclaimedWithin = (url: string, windowMs: number) =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const clock = new TestClock();
      const boss = new PgBoss({ clock, connectionString: url });
      await boss.start();

      return { boss, clock };
    }),
    ({ boss, clock }) =>
      Effect.promise(async () => {
        const [claimed] = await boss.fetch(MESSAGES_QUEUE);

        if (claimed === undefined) {
          return false;
        }

        const claimedAt = clock.now();

        await clock.setTime(claimedAt + HEARTBEAT_LAPSED_MS);
        await boss.supervise(MESSAGES_QUEUE);
        await clock.setTime(claimedAt + windowMs);

        const [again] = await boss.fetch(MESSAGES_QUEUE);

        return again?.id === claimed.id;
      }),
    ({ boss }) => Effect.promise(() => boss.stop({ graceful: false }))
  );

const batch = (number: number) =>
  new SendCampaignBatch({
    batch: number,
    campaignId: CampaignIdSchema.make("cmp_01h455vb4pex5vsknk084sn02q"),
    organizationId: OrganizationIdSchema.make("org_01h455vb4pex5vsknk084sn02q"),
  });

const queueIn = (url: string) =>
  PgBossLive.pipe(
    Layer.provideMerge(PgClient.layer({ url: Redacted.make(url) })),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({ env: { DATABASE_URL: url } })
      )
    )
  );

const enqueueIn = (outcome: "commits" | "rolls back", message: number) =>
  Effect.gen(function* enqueueInTransaction() {
    const sql = yield* SqlClient.SqlClient;
    const queue = yield* Queue;

    yield* sql
      .withTransaction(
        Effect.gen(function* enqueueThenFinish() {
          yield* queue.enqueue([batch(message)]);

          if (outcome === "rolls back") {
            return yield* Effect.fail("rolled back");
          }
        })
      )
      .pipe(Effect.ignore);
  });

interface QueuedJob {
  readonly data: { readonly batch: number };
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  readonly retryDelayMax: number | null;
  readonly expireSeconds: number;
}

const queuedJobs = Effect.gen(function* queuedJobs() {
  const sql = yield* SqlClient.SqlClient;

  return yield* sql<QueuedJob>`
    select
      data,
      retry_limit as "retryLimit",
      retry_delay as "retryDelay",
      retry_backoff as "retryBackoff",
      retry_delay_max as "retryDelayMax",
      expire_seconds as "expireSeconds"
    from pgboss.job
    where name = ${MESSAGES_QUEUE}
  `.withoutTransform;
});

layer(PostgresLive, { timeout: "2 minutes" })("pg-boss Queue", (it) => {
  it.effect(
    "queues a message only if the transaction that queued it commits",
    () =>
      Effect.gen(function* committedOnly() {
        const url = yield* emptyDatabase;

        const jobs = yield* Effect.gen(function* queueTwice() {
          yield* enqueueIn("commits", 1);
          yield* enqueueIn("rolls back", 2);

          return yield* queuedJobs;
        }).pipe(Effect.provide(queueIn(url)));

        assert.deepStrictEqual(
          jobs.map((job) => job.data.batch),
          [1]
        );
      })
  );

  it.effect(
    "retries a message with backoff, and expires a batch only after every email in it could have timed out, on an install whose queue had other options",
    () =>
      Effect.gen(function* retryOptions() {
        const url = yield* emptyDatabase;

        yield* Effect.acquireUseRelease(
          Effect.promise(async () => {
            const boss = new PgBoss({ connectionString: url });
            await boss.start();

            return boss;
          }),
          (boss) =>
            Effect.promise(() =>
              boss.createQueue(MESSAGES_QUEUE, {
                expireInSeconds: 60,
                retryLimit: 1,
              })
            ),
          (boss) => Effect.promise(() => boss.stop({ graceful: false }))
        );

        const [job] = yield* Effect.gen(function* queueOne() {
          yield* enqueueIn("commits", 1);

          return yield* queuedJobs;
        }).pipe(Effect.provide(queueIn(url)));

        assert.deepStrictEqual(
          {
            retryBackoff: job?.retryBackoff,
            retryDelay: job?.retryDelay,
            retryDelayMax: job?.retryDelayMax,
            retryLimit: job?.retryLimit,
          },
          {
            retryBackoff: true,
            retryDelay: QUEUE_RETRY_DELAY_SECONDS,
            retryDelayMax: queueRetryDelaySeconds(QUEUE_RETRIES),
            retryLimit: QUEUE_RETRIES,
          }
        );
        assert.isAtLeast(
          job?.expireSeconds ?? 0,
          SEND_BATCH_SIZE * SEND_TIMEOUT_SECONDS
        );
      })
  );

  it.effect(
    "hands a batch whose worker died holding it to another worker within 3 minutes",
    () =>
      Effect.gen(function* workerDiedHoldingBatch() {
        const url = yield* emptyDatabase;

        yield* Effect.gen(function* queueOneBatch() {
          yield* enqueueIn("commits", 1);
        }).pipe(Effect.provide(queueIn(url)));

        assert.isTrue(yield* reclaimedWithin(url, RECLAIM_WITHIN_MS));
      })
  );
});
