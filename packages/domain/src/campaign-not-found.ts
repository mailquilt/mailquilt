import { Schema } from "effect";

/** The Campaign doesn't exist in this Organization. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class CampaignNotFound extends Schema.TaggedError<CampaignNotFound>()(
  "CampaignNotFound",
  {}
) {}
