import { Schema } from "effect";

import { CampaignSummary } from "./campaign-summary.ts";
import { Count } from "./count.ts";
import { CampaignIdSchema } from "./ids.ts";

/**
 * One page of an Organization's Campaigns, newest first (ADR 0008), shaped
 * like a page of Contacts.
 */
export class CampaignPage extends Schema.Class<CampaignPage>("CampaignPage")({
  campaigns: Schema.Array(CampaignSummary),
  total: Count,
  start: Count,
  previous: Schema.NullOr(CampaignIdSchema),
  next: Schema.NullOr(CampaignIdSchema),
}) {}
