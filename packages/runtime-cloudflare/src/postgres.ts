import { PgClient } from "@effect/sql-pg";
import { DatabaseHealthLive, DatabaseLive } from "@repo/db";
import { Effect, Layer, Redacted } from "effect";

/**
 * The Postgres ports for one request, through a Hyperdrive binding. Workers
 * ties a socket, and the timers of the pool that owns it, to the request that
 * opened them, so nothing here is shared between requests. Hyperdrive keeps
 * the long-lived pool.
 */
export const postgresPortsLive = (hyperdrive: Hyperdrive) =>
  DatabaseHealthLive.pipe(
    Layer.provide(DatabaseLive),
    Layer.provide(
      Layer.unwrap(
        Effect.sync(() =>
          PgClient.layer({ url: Redacted.make(hyperdrive.connectionString) })
        )
      )
    )
  );
