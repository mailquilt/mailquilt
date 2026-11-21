import { RateLimiter } from "@repo/core";
import { inArray, lt, sql } from "drizzle-orm";
import { Clock, Duration, Effect, Layer } from "effect";

import { Database } from "./database.ts";
import { rateLimits } from "./schema.ts";

const EXPIRED_ROWS_DELETED_PER_REQUEST = 100;

/**
 * Fixed windows in Postgres. One upsert counts the request, starting a new
 * window when the old one has ended, and returns the count to decide on, so
 * the check and the increment are atomic. Each request first deletes a few
 * counters whose window has ended, skipping any another request holds, so
 * the table doesn't grow with every IP address and account ever seen. A
 * failed query is a defect: the request fails rather than going through
 * unlimited.
 */
export const RateLimiterLive = Layer.effect(
  RateLimiter,
  Effect.gen(function* rateLimiter() {
    const db = yield* Database;

    return {
      consume: (key, rule) =>
        Effect.gen(function* consume() {
          const now = yield* Clock.currentTimeMillis;
          const nextReset = new Date(now + Duration.toMillis(rule.window));
          yield* db.delete(rateLimits).where(
            inArray(
              rateLimits.key,
              db
                .select({ key: rateLimits.key })
                .from(rateLimits)
                .where(lt(rateLimits.resetAt, new Date(now)))
                .limit(EXPIRED_ROWS_DELETED_PER_REQUEST)
                .for("update", { skipLocked: true })
            )
          );

          const windowEnded = sql`${rateLimits.resetAt} <= ${new Date(now).toISOString()}::timestamptz`;

          const [counted] = yield* db
            .insert(rateLimits)
            .values({ count: 1, key, resetAt: nextReset })
            .onConflictDoUpdate({
              set: {
                count: sql`case when ${windowEnded} then 1 else ${rateLimits.count} + 1 end`,
                resetAt: sql`case when ${windowEnded} then ${nextReset.toISOString()}::timestamptz else ${rateLimits.resetAt} end`,
              },
              target: rateLimits.key,
            })
            .returning({
              count: rateLimits.count,
              resetAt: rateLimits.resetAt,
            });

          if (counted === undefined || counted.count <= rule.max) {
            return { allowed: true } as const;
          }

          return {
            allowed: false,
            retryAfter: Duration.millis(
              Math.max(0, counted.resetAt.getTime() - now)
            ),
          } as const;
        }).pipe(Effect.orDie),
    };
  })
);
