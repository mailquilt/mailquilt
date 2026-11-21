import type { DatabaseUnreachable } from "@repo/domain";
import { Health } from "@repo/domain";
import { Context, Effect } from "effect";

/** Port: confirms the database answers a query. */
export class DatabaseHealth extends Context.Service<
  DatabaseHealth,
  { readonly check: Effect.Effect<void, DatabaseUnreachable> }
>()("@repo/core/DatabaseHealth") {}

export const checkHealth = Effect.gen(function* checkHealth() {
  const database = yield* DatabaseHealth;
  yield* database.check;

  return new Health({ database: "connected" });
});
