import { CampaignIdSchema } from "@repo/domain";
import { Effect, flow, Schema } from "effect";
import type { Types } from "effect";

const droppedIfInvalid = <S extends Schema.Top>(schema: S) =>
  schema.pipe(Schema.catchDecoding(() => Effect.succeedNone));

const CampaignSearchInUrl = Schema.Struct({
  after: Schema.optionalKey(droppedIfInvalid(CampaignIdSchema)),
  before: Schema.optionalKey(droppedIfInvalid(CampaignIdSchema)),
});

/**
 * Which page of Campaigns the table shows, kept in the page's URL (ADR 0008).
 * A part that doesn't parse, such as an edited ID, is dropped.
 */
export type CampaignSearch = typeof CampaignSearchInUrl.Type;

const oneCursor = ({ after, before }: CampaignSearch) => {
  const search: Types.Mutable<CampaignSearch> = {};

  if (after !== undefined) {
    search.after = after;
  } else if (before !== undefined) {
    search.before = before;
  }

  return search satisfies CampaignSearch;
};

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
