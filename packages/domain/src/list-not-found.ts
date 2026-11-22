import { Schema } from "effect";

/** The List doesn't exist in this Organization. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class ListNotFound extends Schema.TaggedError<ListNotFound>()(
  "ListNotFound",
  {}
) {}
