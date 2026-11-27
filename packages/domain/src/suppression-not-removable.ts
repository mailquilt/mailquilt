import { Schema } from "effect";

/**
 * The Suppression came from a bounce or a complaint, not a member, so
 * it can't be removed: only one added by hand can.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class SuppressionNotRemovable extends Schema.TaggedError<SuppressionNotRemovable>()(
  "SuppressionNotRemovable",
  {}
) {}
