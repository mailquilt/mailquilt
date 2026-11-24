import { CampaignIdSchema, OrganizationIdSchema } from "@repo/domain";
import { Schema } from "effect";

/** Send one batch of a Campaign's recipients: those still queued in `batch`. */
export class SendCampaignBatch extends Schema.TaggedClass<SendCampaignBatch>()(
  "SendCampaignBatch",
  {
    organizationId: OrganizationIdSchema,
    campaignId: CampaignIdSchema,
    batch: Schema.Int,
  }
) {}
