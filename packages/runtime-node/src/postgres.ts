import { PgClient } from "@effect/sql-pg";
import { DatabaseHealthLive, DatabaseLive } from "@repo/db";
import { Config, Layer } from "effect";

const PostgresLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
});

/** The Postgres ports, sharing one connection pool for the whole process. */
export const PostgresPortsLive = DatabaseHealthLive.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(PostgresLive)
);
