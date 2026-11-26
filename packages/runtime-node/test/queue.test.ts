import { spawn } from "node:child_process";
import { once } from "node:events";

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

const TICK_MS = 30 * 1000;

const RECLAIM_WITHIN_MS = 3 * 60 * 1000;

// WARNING: the worker runs in its own process, so SIGKILL stops it as a crash would: no graceful stop, no failed job, no more heartbeats.
const KILLED_WORKER = `
import { PgBoss } from "pg-boss";
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
await boss.start();
await boss.work("${MESSAGES_QUEUE}", { pollingIntervalSeconds: 0.5 }, () => {
  process.stdout.write("claimed\\n");
  return new Promise(() => {});
});
`;

const killWorkerHoldingABatch = (url: string) =>
  Effect.promise(async () => {
    const worker = spawn(
      process.execPath,
      ["--input-type=module", "--eval", KILLED_WORKER],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, DATABASE_URL: url },
        stdio: ["ignore", "pipe", "inherit"],
      }
    );

    await once(worker.stdout, "data");
    worker.kill("SIGKILL");
    await once(worker, "exit");
  });

const reclaimedAfterMs = (url: string) =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const clock = new TestClock();
      const boss = new PgBoss({ clock, connectionString: url });
      await boss.start();

      return { boss, clock };
    }),
    ({ boss, clock }) =>
      Effect.promise(async () => {
        let handed = false;

        await boss.work(MESSAGES_QUEUE, { pollingIntervalSeconds: 1 }, () => {
          handed = true;

          return Promise.resolve();
        });

        for (
          let elapsed = 0;
          elapsed <= RECLAIM_WITHIN_MS;
          elapsed += TICK_MS
        ) {
          if (handed) {
            return elapsed;
          }

          // oxlint-disable-next-line no-await-in-loop -- each tick must finish before time moves on again.
          await clock.tick(TICK_MS);
        }

        return null;
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
    "hands a batch whose worker was killed mid-send to another worker within 3 minutes",
    () =>
      Effect.gen(function* killedWorker() {
        const url = yield* emptyDatabase;

        yield* Effect.gen(function* queueThenKill() {
          yield* enqueueIn("commits", 1);
          yield* killWorkerHoldingABatch(url);
        }).pipe(Effect.provide(queueIn(url)));

        const after = yield* reclaimedAfterMs(url);

        assert.isNotNull(after);
      })
  );
});
