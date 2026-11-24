import { PgClient } from "@effect/sql-pg";
import { DatabaseLive } from "@repo/db";
import { migrateDatabase } from "@repo/db/migrate";
import { Config, Effect } from "effect";

/**
 * Applies any migrations not yet applied, on a connection pool of its own
 * that closes afterwards. Replicas starting together take turns, behind a
 * Postgres advisory lock.
 */
export const migrateOnBoot = migrateDatabase.pipe(
  Effect.provide(DatabaseLive),
  Effect.provide(PgClient.layerConfig({ url: Config.Redacted("DATABASE_URL") }))
);
