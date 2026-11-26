import { Data } from "effect";

/** A token that wasn't signed by this install for this purpose, was changed, or has expired. */
export class InvalidToken extends Data.TaggedError("InvalidToken") {}
