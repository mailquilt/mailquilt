import { Schema } from "effect";

/**
 * A Provider Connection's server changed while it keeps its saved
 * credentials. They are only ever sent to the server they were entered for,
 * so they must be entered again.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class CredentialsRequired extends Schema.TaggedError<CredentialsRequired>()(
  "CredentialsRequired",
  {}
) {}
