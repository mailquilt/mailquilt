import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Effect } from "effect";

import { Database } from "./database.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../migrations", import.meta.url)
);

/**
 * Applies every migration not yet applied. Reads the migration files from
 * disk, so it runs on Node only: in tests, and from the deploy step.
 */
export const migrateDatabase = Effect.gen(function* migrateDatabase() {
  const db = yield* Database;
  yield* migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});
