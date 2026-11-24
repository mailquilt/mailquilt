import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Effect } from "effect";

import { Database } from "./database.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../migrations", import.meta.url)
);

const MIGRATION_ADVISORY_LOCK = 4_242_001;

/**
 * Applies every migration not yet applied, in one transaction that first
 * takes a Postgres advisory lock. A second process booting at the same time
 * waits for the first to commit, then finds nothing left to apply. Reads the
 * migration files from disk, so it runs on Node only: on boot, in tests, and
 * from the deploy step.
 */
export const migrateDatabase = Effect.gen(function* migrateDatabase() {
  const db = yield* Database;

  yield* db.transaction((tx) =>
    Effect.gen(function* migrateUnderLock() {
      yield* tx.execute(
        sql`select pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK})`
      );
      yield* migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    })
  );
});
