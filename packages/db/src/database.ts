import { DatabaseHealth } from "@repo/core";
import { DatabaseUnreachable } from "@repo/domain";
import { sql } from "drizzle-orm";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Cause, Context, Effect, Layer } from "effect";

/** The Drizzle database. Needs a `PgClient`, which each runtime provides. */
export class Database extends Context.Service<
  Database,
  PgDrizzle.EffectPgDatabase
>()("@repo/db/Database") {}

export const DatabaseLive = Layer.effect(
  Database,
  PgDrizzle.makeWithDefaults()
);

export const DatabaseHealthLive = Layer.effect(
  DatabaseHealth,
  Effect.gen(function* databaseHealth() {
    const db = yield* Database;

    return {
      check: db.execute(sql`select 1`).pipe(
        Effect.tapCause((cause) =>
          Effect.logWarning("Database health check failed", Cause.pretty(cause))
        ),
        Effect.mapError(() => new DatabaseUnreachable()),
        Effect.asVoid
      ),
    };
  })
);
