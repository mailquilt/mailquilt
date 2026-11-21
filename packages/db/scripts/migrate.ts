import { PgClient } from "@effect/sql-pg";
import { Config, Effect } from "effect";

import { DatabaseLive } from "../src/database.ts";
import { migrateDatabase } from "../src/migrate.ts";

await Effect.runPromise(
  migrateDatabase.pipe(
    Effect.provide(DatabaseLive),
    Effect.provide(
      PgClient.layerConfig({ url: Config.Redacted("DATABASE_URL") })
    )
  )
);
