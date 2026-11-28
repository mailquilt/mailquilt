import type {
  BounceDomain,
  Campaigns,
  DeliveryEventPartitions,
  ProviderConnections,
  PublicUrl,
  QueueMessage,
  SesProvider,
  SignedTokens,
  SmtpProvider,
  SendingDomains,
} from "@repo/core";
import {
  createDeliveryEventPartitions,
  handleQueueMessage,
  Queue,
  QUEUE_RETRIES,
  QUEUE_RETRY_DELAY_SECONDS,
  QueueMessageSchema,
  queueRetryDelaySeconds,
  Scheduler,
  SEND_BATCH_SIZE,
} from "@repo/core";
import { MIN_EMAILS_PER_MINUTE } from "@repo/domain";
import { SEND_TIMEOUT_SECONDS } from "@repo/providers/smtp";
import {
  Cause,
  Config,
  Context,
  DateTime,
  Effect,
  Layer,
  pipe,
  Redacted,
  Schema,
} from "effect";
import type { Dns } from "effect/net";
import { SqlClient } from "effect/sql";
import { PgBoss } from "pg-boss";

const MESSAGES_QUEUE = "mailquilt";

const MAINTENANCE_QUEUE = "maintenance";

const MARGIN_SECONDS = 300;

const MINUTE_SECONDS = 60;

const LONGEST_SLOT_WAIT_SECONDS = MINUTE_SECONDS / MIN_EMAILS_PER_MINUTE;

// WARNING: pg-boss retries a job it thinks expired while the first attempt may still be sending, so a batch's deadline covers every email in it waiting for its slot at the slowest sending rate and then taking its longest.
const BATCH_EXPIRES_IN_SECONDS =
  SEND_BATCH_SIZE * (LONGEST_SLOT_WAIT_SECONDS + SEND_TIMEOUT_SECONDS) +
  MARGIN_SECONDS;

// WARNING: without a heartbeat, a batch whose worker was killed mid-send waits out its expiry, over an hour and a half, before another worker retries it (ADR 0014).
const HEARTBEAT_SECONDS = 30;

const EVERY_DAY_AT_3_UTC = "0 3 * * *";

const MESSAGES_QUEUE_OPTIONS = {
  expireInSeconds: BATCH_EXPIRES_IN_SECONDS,
  heartbeatSeconds: HEARTBEAT_SECONDS,
  retryBackoff: true,
  retryDelay: QUEUE_RETRY_DELAY_SECONDS,
  retryDelayMax: queueRetryDelaySeconds(QUEUE_RETRIES),
  retryLimit: QUEUE_RETRIES,
};

const encodeMessage = Schema.encodeEffect(QueueMessageSchema);

const decodeMessage = Schema.decodeUnknownEffect(QueueMessageSchema);

class Boss extends Context.Service<Boss, PgBoss>()("@repo/runtime-node/Boss") {}

const BossLive = Layer.effect(
  Boss,
  Effect.acquireRelease(
    Effect.gen(function* startBoss() {
      const url = yield* Config.Redacted("DATABASE_URL");

      const boss = new PgBoss({
        application_name: "mailquilt-queue",
        connectionString: Redacted.value(url),
      });

      boss.on("error", (error) => {
        Effect.runFork(
          Effect.logError("The queue hit an error", Cause.fail(error))
        );
      });

      yield* Effect.promise(() => boss.start());
      yield* Effect.promise(() =>
        boss.createQueue(MESSAGES_QUEUE, MESSAGES_QUEUE_OPTIONS)
      );
      yield* Effect.promise(() =>
        boss.updateQueue(MESSAGES_QUEUE, MESSAGES_QUEUE_OPTIONS)
      );
      yield* Effect.promise(() => boss.createQueue(MAINTENANCE_QUEUE));

      return boss;
    }),
    (boss) => Effect.promise(() => boss.stop({ graceful: true }))
  )
);

interface Job {
  readonly message: QueueMessage;
  readonly startAfter?: Date;
}

const PgBossQueueLive = Layer.effectContext(
  Effect.gen(function* pgBossQueue() {
    const boss = yield* Boss;
    const sql = yield* SqlClient.SqlClient;

    const insert = (jobs: readonly Job[]) =>
      Effect.gen(function* insertJobs() {
        if (jobs.length === 0) {
          return;
        }

        const encoded = yield* pipe(
          jobs,
          Effect.forEach(({ message, startAfter }) =>
            Effect.map(encodeMessage(message), (data) =>
              startAfter === undefined ? { data } : { data, startAfter }
            )
          )
        );

        // WARNING: the fiber's context holds an open transaction's connection; pg-boss's statement must run with it to join that transaction.
        const context = yield* Effect.context<never>();

        const db = {
          executeSql: (text: string, values?: unknown[]) =>
            Effect.runPromiseWith(context)(sql.unsafe(text, values)).then(
              (rows) => ({ rows: [...rows] })
            ),
        };

        yield* Effect.promise(() =>
          boss.insert(MESSAGES_QUEUE, encoded, { db })
        );
      }).pipe(Effect.orDie);

    return Context.make(Queue, {
      enqueue: (messages) => insert(messages.map((message) => ({ message }))),
    }).pipe(
      Context.add(Scheduler, {
        schedule: (message, at) =>
          insert([{ message, startAfter: DateTime.toDateUtc(at) }]),
      })
    );
  })
);

/**
 * pg-boss, and the Queue and Scheduler on it: a scheduled message is a job
 * that starts after its time (ADR 0017). Needs the app's `SqlClient`, so
 * queued messages join its transactions.
 */
export const PgBossLive = PgBossQueueLive.pipe(Layer.provideMerge(BossLive));

type WorkerPorts =
  | BounceDomain
  | Campaigns
  | DeliveryEventPartitions
  | Dns.Dns
  | ProviderConnections
  | PublicUrl
  | Queue
  | SendingDomains
  | SesProvider
  | SignedTokens
  | SmtpProvider;

/**
 * Starts consuming queued messages, and schedules the daily maintenance job,
 * which makes delivery events' coming partitions. Makes them once at start
 * too, so a new install has them before its first send.
 */
export const QueueWorkersLive = Layer.effectDiscard(
  Effect.gen(function* queueWorkers() {
    const boss = yield* Boss;
    const ports = yield* Effect.context<WorkerPorts>();
    const run = Effect.runPromiseWith(ports);

    yield* createDeliveryEventPartitions;

    yield* Effect.promise(() =>
      boss.work(MESSAGES_QUEUE, (jobs) =>
        run(
          pipe(
            jobs,
            Effect.forEach((job) =>
              decodeMessage(job.data).pipe(
                Effect.flatMap((message) =>
                  handleQueueMessage(message, job.retryCount + 1)
                )
              )
            )
          )
        )
      )
    );

    yield* Effect.promise(() =>
      boss.work(MAINTENANCE_QUEUE, () => run(createDeliveryEventPartitions))
    );

    yield* Effect.promise(() =>
      boss.schedule(MAINTENANCE_QUEUE, EVERY_DAY_AT_3_UTC)
    );
  })
);
