import { Layer } from "effect";

import { DatabaseHealthLive, DatabaseLive } from "./database.ts";
import { RateLimiterLive } from "./rate-limiter.ts";

export { Database, DatabaseHealthLive, DatabaseLive } from "./database.ts";

export { RateLimiterLive } from "./rate-limiter.ts";

/** Every port backed by Postgres. Needs a `PgClient`, which each runtime provides. */
export const DatabasePortsLive = Layer.mergeAll(
  DatabaseHealthLive,
  RateLimiterLive
).pipe(Layer.provide(DatabaseLive));
