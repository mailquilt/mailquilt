import { PgClient } from "@effect/sql-pg";
import { DatabasePortsLive } from "@repo/db";
import { Config, Layer } from "effect";

const PostgresLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
});

/**
 * The Postgres ports and the `SqlClient` Better Auth queries through, sharing
 * one connection pool for the whole process.
 */
export const PostgresPortsLive = DatabasePortsLive.pipe(
  Layer.provideMerge(PostgresLive)
);
