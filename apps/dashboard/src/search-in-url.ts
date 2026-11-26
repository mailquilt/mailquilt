import { Effect, Schema } from "effect";
import type { Types } from "effect";

/**
 * A part of a page's search that is dropped, rather than failing the page,
 * when it doesn't parse, such as an edited or out-of-date ID (ADR 0012).
 */
export const droppedIfInvalid = <S extends Schema.Top>(schema: S) =>
  schema.pipe(Schema.catchDecoding(() => Effect.succeedNone));

/** Which page of a long collection to show: after a cursor, or before it (ADR 0008). */
export interface PageCursor<Id> {
  readonly after?: Id;
  readonly before?: Id;
}

/**
 * Keeps one cursor of a paged search, the forward one if both are given, as
 * the API accepts (ADR 0008).
 */
export const oneCursor = <Id>({ after, before }: PageCursor<Id>) => {
  const cursor: Types.Mutable<PageCursor<Id>> = {};

  if (after !== undefined) {
    cursor.after = after;
  } else if (before !== undefined) {
    cursor.before = before;
  }

  return cursor;
};
