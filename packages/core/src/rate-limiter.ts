import { Context } from "effect";
import type { Duration, Effect } from "effect";

/** At most `max` requests per `window` for one key. */
export interface RateLimitRule {
  readonly max: number;
  readonly window: Duration.Duration;
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfter: Duration.Duration };

/**
 * Port: counts requests against a key, such as an IP address or an account,
 * in fixed windows. `consume` records the request and decides in one atomic
 * step, so concurrent requests can't all pass on a stale count.
 */
export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    readonly consume: (
      key: string,
      rule: RateLimitRule
    ) => Effect.Effect<RateLimitDecision>;
  }
>()("@repo/core/RateLimiter") {}
