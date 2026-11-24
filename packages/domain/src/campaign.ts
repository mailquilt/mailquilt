import { Schema } from "effect";

import { CampaignHtml } from "./campaign-content.ts";
import { CampaignSummary } from "./campaign-summary.ts";

/**
 * One email, holding its own copy of its content, sent once to a List, with
 * its HTML. See `CampaignSummary` for the other fields.
 */
export class Campaign extends Schema.Class<Campaign>("Campaign")({
  ...CampaignSummary.fields,
  html: CampaignHtml,
}) {}
