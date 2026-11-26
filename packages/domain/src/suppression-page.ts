import { Schema } from "effect";

import { Count } from "./count.ts";
import { SuppressionIdSchema } from "./ids.ts";
import { Suppression } from "./suppression.ts";

/**
 * One page of an Organization's Suppressions, newest first (ADR 0008).
 * `total` counts every one, and `start` is how many come before this page.
 * `previous` and `next` are the cursors for the pages either side, or null
 * at either end.
 */
export class SuppressionPage extends Schema.Class<SuppressionPage>(
  "SuppressionPage"
)({
  suppressions: Schema.Array(Suppression),
  total: Count,
  start: Count,
  previous: Schema.NullOr(SuppressionIdSchema),
  next: Schema.NullOr(SuppressionIdSchema),
}) {}
