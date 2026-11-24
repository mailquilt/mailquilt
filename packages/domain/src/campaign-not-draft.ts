import { Schema } from "effect";

/** The Campaign was already sent, or is being sent, so it can't be changed or sent again. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class CampaignNotDraft extends Schema.TaggedError<CampaignNotDraft>()(
  "CampaignNotDraft",
  {}
) {}
