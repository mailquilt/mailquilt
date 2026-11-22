import { Schema } from "effect";

/** The Contact doesn't exist in this Organization. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class ContactNotFound extends Schema.TaggedError<ContactNotFound>()(
  "ContactNotFound",
  {}
) {}
