import { Schema } from "effect";

/**
 * The Organization doesn't exist, or the person asking isn't a member of it.
 * The two look the same, so an ID never reveals another tenant.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class OrganizationNotFound extends Schema.TaggedError<OrganizationNotFound>()(
  "OrganizationNotFound",
  {}
) {}
