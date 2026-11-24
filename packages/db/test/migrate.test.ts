import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PgClient } from "@effect/sql-pg";
import { assert, layer } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { SqlClient } from "effect/sql";

import { DatabaseLive } from "../src/database.ts";
import { migrateDatabase } from "../src/migrate.ts";
import { emptyDatabase, PostgresLive } from "./postgres.ts";

const MIGRATION_FOLDERS = readdirSync(
  fileURLToPath(new URL("../migrations", import.meta.url)),
  { withFileTypes: true }
).filter((entry) => entry.isDirectory()).length;

const migrateFromOneReplica = (url: string) =>
  migrateDatabase.pipe(
    Effect.provide(DatabaseLive),
    Effect.provide(PgClient.layer({ url: Redacted.make(url) }))
  );

layer(PostgresLive, { timeout: "2 minutes" })("Migrations", (test) => {
  test.effect(
    "two replicas booting at once both migrate, and each migration is applied once",
    () =>
      Effect.gen(function* migrateTogether() {
        const url = yield* emptyDatabase;

        yield* Effect.all(
          [migrateFromOneReplica(url), migrateFromOneReplica(url)],
          { concurrency: "unbounded" }
        );

        const applied = yield* Effect.gen(function* countApplied() {
          const sql = yield* SqlClient.SqlClient;

          return yield* sql<{
            readonly count: number;
          }>`select count(*)::int as count from drizzle.__drizzle_migrations`;
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })));

        assert.strictEqual(applied[0]?.count, MIGRATION_FOLDERS);
      })
  );
});
