import { Schema } from "effect";

/** The Organization already has a Contact with this email address. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class ContactAlreadyExists extends Schema.TaggedError<ContactAlreadyExists>()(
  "ContactAlreadyExists",
  {}
) {}
