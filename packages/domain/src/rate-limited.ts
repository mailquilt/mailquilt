import { Schema } from "effect";

/** Too many requests of this kind; try again after `retryAfterSeconds`. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  { retryAfterSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }
) {}
