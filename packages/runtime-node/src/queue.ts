import type {
  Campaigns,
  DeliveryEventPartitions,
  ProviderConnections,
  SmtpProvider,
} from "@repo/core";
import {
  createDeliveryEventPartitions,
  handleQueueMessage,
  Queue,
  QUEUE_RETRIES,
  QUEUE_RETRY_DELAY_SECONDS,
  QueueMessageSchema,
  queueRetryDelaySeconds,
  SEND_BATCH_SIZE,
} from "@repo/core";
import { SEND_TIMEOUT_SECONDS } from "@repo/providers/smtp";
import {
  Cause,
  Config,
  Context,
  Effect,
  Layer,
  pipe,
  Redacted,
  Schema,
} from "effect";
import { SqlClient } from "effect/sql";
import { PgBoss } from "pg-boss";

const MESSAGES_QUEUE = "mailquilt";

const MAINTENANCE_QUEUE = "maintenance";

const MARGIN_SECONDS = 300;

// WARNING: pg-boss retries a job it thinks expired while the first attempt may still be sending, so a batch's deadline covers every email in it taking its longest.
const BATCH_EXPIRES_IN_SECONDS =
  SEND_BATCH_SIZE * SEND_TIMEOUT_SECONDS + MARGIN_SECONDS;

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

const encodeMessages = Schema.encodeEffect(Schema.Array(QueueMessageSchema));

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

const PgBossQueueLive = Layer.effect(
  Queue,
  Effect.gen(function* pgBossQueue() {
    const boss = yield* Boss;
    const sql = yield* SqlClient.SqlClient;

    return {
      enqueue: (messages) =>
        Effect.gen(function* enqueue() {
          if (messages.length === 0) {
            return;
          }

          const encoded = yield* encodeMessages(messages);

          // WARNING: the fiber's context holds an open transaction's connection; pg-boss's statement must run with it to join that transaction.
          const context = yield* Effect.context<never>();

          const db = {
            executeSql: (text: string, values?: unknown[]) =>
              Effect.runPromiseWith(context)(sql.unsafe(text, values)).then(
                (rows) => ({ rows: [...rows] })
              ),
          };

          yield* Effect.promise(() =>
            boss.insert(
              MESSAGES_QUEUE,
              encoded.map((data) => ({ data })),
              { db }
            )
          );
        }).pipe(Effect.orDie),
    };
  })
);

/** pg-boss and the Queue on it. Needs the app's `SqlClient`, so queued messages join its transactions. */
export const PgBossLive = PgBossQueueLive.pipe(Layer.provideMerge(BossLive));

type WorkerPorts =
  | Campaigns
  | DeliveryEventPartitions
  | ProviderConnections
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
              decodeMessage(job.data).pipe(Effect.flatMap(handleQueueMessage))
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
