import { PgClient } from "@effect/sql-pg";
import { DatabasePortsLive } from "@repo/db";
import { Config, Layer } from "effect";

import { CredentialCipherFromEnv } from "./credential-cipher.ts";
import { PgBossLive } from "./queue.ts";

const PostgresLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
});

/**
 * The Postgres ports, the Queue on pg-boss, and the `SqlClient` Better Auth
 * queries through, sharing one connection pool for the whole process.
 * pg-boss keeps a pool of its own for consuming and scheduling.
 */
export const PostgresPortsLive = Layer.mergeAll(
  DatabasePortsLive,
  PgBossLive
).pipe(
  Layer.provideMerge(PostgresLive),
  Layer.provide(CredentialCipherFromEnv)
);
