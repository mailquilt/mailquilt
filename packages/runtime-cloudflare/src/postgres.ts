import { PgClient } from "@effect/sql-pg";
import { credentialCipherLayer } from "@repo/core";
import { DatabaseLive, DatabasePortsLive } from "@repo/db";
import { Effect, Layer, Redacted } from "effect";

import type { QueueBinding } from "./queue-binding.ts";
import { outboxQueueLive } from "./queue.ts";

/**
 * The Postgres ports, the Queue through the outbox, the Drizzle `Database`,
 * and the `SqlClient` Better Auth queries through, for one request, queue
 * delivery or scheduled run through a Hyperdrive binding. Workers ties a
 * socket, and the timers of the pool that owns it, to the request that
 * opened them, so nothing here is shared between requests. Hyperdrive keeps
 * the long-lived pool. `encryptionKeys` seal Provider Connection credentials
 * (ADR 0009).
 */
export const postgresPortsLive = (
  hyperdrive: Hyperdrive,
  encryptionKeys: Redacted.Redacted<string>,
  queue: QueueBinding
) =>
  Layer.mergeAll(DatabasePortsLive, outboxQueueLive(queue)).pipe(
    Layer.provide(credentialCipherLayer(encryptionKeys)),
    Layer.provideMerge(DatabaseLive),
    Layer.provideMerge(
      Layer.unwrap(
        Effect.sync(() =>
          PgClient.layer({ url: Redacted.make(hyperdrive.connectionString) })
        )
      )
    )
  );
