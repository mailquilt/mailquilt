import { Schema } from "effect";

/** A number of things: a whole number, never negative. */
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
