import { Schema } from "effect";

/** The request has no valid session. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SignInRequired extends Schema.TaggedError<SignInRequired>()(
  "SignInRequired",
  {}
) {}
