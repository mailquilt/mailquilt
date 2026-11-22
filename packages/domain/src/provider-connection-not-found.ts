import { Schema } from "effect";

/** The Provider Connection doesn't exist in this Organization. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class ProviderConnectionNotFound extends Schema.TaggedError<ProviderConnectionNotFound>()(
  "ProviderConnectionNotFound",
  {}
) {}
