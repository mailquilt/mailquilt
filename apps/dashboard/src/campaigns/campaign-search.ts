import { CampaignIdSchema } from "@repo/domain";
import { flow, Schema } from "effect";

import { droppedIfInvalid, oneCursor } from "../search-in-url.ts";

const CampaignSearchInUrl = Schema.Struct({
  after: Schema.optionalKey(droppedIfInvalid(CampaignIdSchema)),
  before: Schema.optionalKey(droppedIfInvalid(CampaignIdSchema)),
});

/**
 * Which page of Campaigns the table shows, kept in the page's URL (ADR 0008).
 * A part that doesn't parse, such as an edited ID, is dropped.
 */
export type CampaignSearch = typeof CampaignSearchInUrl.Type;

/**
 * Reads the Campaigns table's search from the URL, keeping one cursor, the
 * forward one if both are given, as the API accepts.
 */
export const readCampaignSearch = flow(
  Schema.decodeUnknownSync(CampaignSearchInUrl),
  oneCursor
);

/** In place of a Campaigns page before the person has an Organization. */
export const CAMPAIGNS_NEED_AN_ORGANIZATION =
  "Campaigns belong to an organization. Name yours on Home first.";
