import { SuppressionIdSchema } from "@repo/domain";
import { flow, Schema } from "effect";

import { droppedIfInvalid, oneCursor } from "../search-in-url.ts";

const SuppressionSearchInUrl = Schema.Struct({
  after: Schema.optionalKey(droppedIfInvalid(SuppressionIdSchema)),
  before: Schema.optionalKey(droppedIfInvalid(SuppressionIdSchema)),
});

/**
 * Which page of Suppressions the table shows, kept in the page's URL (ADR
 * 0008). A part that doesn't parse, such as an edited ID, is dropped.
 */
export type SuppressionSearch = typeof SuppressionSearchInUrl.Type;

/**
 * Reads the Suppressions table's search from the URL, keeping one cursor,
 * the forward one if both are given, as the API accepts.
 */
export const readSuppressionSearch = flow(
  Schema.decodeUnknownSync(SuppressionSearchInUrl),
  oneCursor
);
