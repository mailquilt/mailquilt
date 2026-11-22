import { PgClient } from "@effect/sql-pg";
import { credentialCipherLayer } from "@repo/core";
import { DatabasePortsLive } from "@repo/db";
import { Effect, Layer, Redacted } from "effect";

/**
 * The Postgres ports, and the `SqlClient` Better Auth queries through, for one
 * request through a Hyperdrive binding. Workers ties a socket, and the timers
 * of the pool that owns it, to the request that opened them, so nothing here
 * is shared between requests. Hyperdrive keeps the long-lived pool.
 * `encryptionKeys` seal Provider Connection credentials (ADR 0009).
 */
export const postgresPortsLive = (
  hyperdrive: Hyperdrive,
  encryptionKeys: Redacted.Redacted<string>
) =>
  DatabasePortsLive.pipe(
    Layer.provide(credentialCipherLayer(encryptionKeys)),
    Layer.provideMerge(
      Layer.unwrap(
        Effect.sync(() =>
          PgClient.layer({ url: Redacted.make(hyperdrive.connectionString) })
        )
      )
    )
  );
