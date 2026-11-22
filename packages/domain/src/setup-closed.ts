import { Schema } from "effect";

/**
 * The install's first-run setup has already made its instance admin. Setup
 * runs once; it never opens again.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SetupClosed extends Schema.TaggedError<SetupClosed>()(
  "SetupClosed",
  {}
) {}
