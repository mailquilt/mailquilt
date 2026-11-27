import { Schema } from "effect";

/**
 * The Campaign isn't sending, so it can't be paused, resumed or cancelled:
 * it hasn't started, it was sent, or, to pause or resume it, it was
 * cancelled.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not an Error constructor.
export class CampaignNotSending extends Schema.TaggedError<CampaignNotSending>()(
  "CampaignNotSending",
  {}
) {}
