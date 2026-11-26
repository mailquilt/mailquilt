import { Schema } from "effect";

/** The Suppression doesn't exist in this Organization. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SuppressionNotFound extends Schema.TaggedError<SuppressionNotFound>()(
  "SuppressionNotFound",
  {}
) {}
