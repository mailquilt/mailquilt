import { Data } from "effect";

/** A webhook request that isn't a valid, signed notification from the Provider. */
export class InvalidNotification extends Data.TaggedError(
  "InvalidNotification"
) {}
