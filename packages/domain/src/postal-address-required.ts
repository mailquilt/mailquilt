import { Schema } from "effect";

/** The Organization has no postal address yet, and every Campaign must end with one. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class PostalAddressRequired extends Schema.TaggedError<PostalAddressRequired>()(
  "PostalAddressRequired",
  {}
) {}
