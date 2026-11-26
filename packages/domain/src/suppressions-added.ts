import { Schema } from "effect";

import { Count } from "./count.ts";

/**
 * The most addresses one request can Suppress. 250 of the longest address
 * (254 characters) still fit in the API's 64 KiB request body as JSON.
 */
export const MAX_SUPPRESSIONS_ADDED_AT_ONCE = 250;

/**
 * What Suppressing a set of addresses did, counting each address once
 * whatever its case. An address already Suppressed keeps its Suppression,
 * and its reason, as it was.
 */
export class SuppressionsAdded extends Schema.Class<SuppressionsAdded>(
  "SuppressionsAdded"
)({
  added: Count,
  alreadySuppressed: Count,
}) {}
