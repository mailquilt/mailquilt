import { Data } from "effect";

/** The value was sealed with a key this deployment no longer has, for another row, or was changed. */
export class CredentialsUnreadable extends Data.TaggedError(
  "CredentialsUnreadable"
) {}
