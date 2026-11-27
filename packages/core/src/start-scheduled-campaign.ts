import { CampaignIdSchema, OrganizationIdSchema } from "@repo/domain";
import { Schema } from "effect";

/**
 * Start sending a Campaign scheduled for `at`, if it still is: one whose
 * schedule was cancelled or moved, or that already started, is left alone.
 */
export class StartScheduledCampaign extends Schema.TaggedClass<StartScheduledCampaign>()(
  "StartScheduledCampaign",
  {
    organizationId: OrganizationIdSchema,
    campaignId: CampaignIdSchema,
    at: Schema.DateTimeUtcFromString,
  }
) {}
