import { PAGE_SIZE } from "@repo/domain";
import { and, asc, desc, gt, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { Effect } from "effect";

import type { Database } from "./database.ts";

/** Which page to read: the one after a cursor, the one before it, or, with neither, the first. */
export interface PageCursor {
  readonly after?: string | undefined;
  readonly before?: string | undefined;
}

/** One page of rows, newest first, and where it sits among every matching row. */
export interface NewestFirstPage<Row> {
  readonly items: readonly Row[];
  readonly next: string | null;
  readonly previous: string | null;
  readonly start: number;
  readonly total: number;
}

/**
 * Reads one page of the rows of `table` in `scope`, the condition that keeps
 * them to one Organization, and `matching`, any filter, newest first by `id`,
 * as ADR 0008 describes: `rows` selects them, and this adds the cursor, the
 * order and the limit. `scope` is required, so a page can't leave it out. A cursor past every matching row returns the
 * first page. Run it in the caller's read-only `repeatable read` transaction,
 * so the page and its counts agree. A failed query is a defect.
 */
export const newestFirstPage = <Row extends { readonly id: string }, E>(
  db: typeof Database.Service,
  {
    cursor,
    id,
    matching,
    rows,
    scope,
    table,
  }: {
    readonly table: PgTable;
    readonly id: PgColumn;
    readonly scope: SQL;
    readonly matching?: SQL | undefined;
    readonly cursor: PageCursor;
    readonly rows: (
      where: SQL | undefined,
      order: SQL,
      limit: number
    ) => Effect.Effect<readonly Row[], E>;
  }
) =>
  Effect.gen(function* newestFirstPageOfRows() {
    const inScope = and(scope, matching);

    const firstPage = rows(inScope, desc(id), PAGE_SIZE).pipe(Effect.orDie);

    const aroundCursor =
      cursor.before === undefined
        ? rows(
            and(
              inScope,
              cursor.after === undefined ? undefined : lt(id, cursor.after)
            ),
            desc(id),
            PAGE_SIZE
          ).pipe(Effect.orDie)
        : rows(and(inScope, gt(id, cursor.before)), asc(id), PAGE_SIZE).pipe(
            Effect.orDie,
            Effect.map((found) => found.toReversed())
          );

    const inWindow = yield* aroundCursor;

    const cursorPassedEveryMatch =
      inWindow.length === 0 &&
      (cursor.after !== undefined || cursor.before !== undefined);

    const items = cursorPassedEveryMatch ? yield* firstPage : inWindow;

    const first = items[0]?.id ?? "";

    const [counted] = yield* db
      .select({
        start: sql<number>`(count(*) filter (where ${id} > ${first}))::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(table)
      .where(inScope)
      .pipe(Effect.orDie);

    const start = counted?.start ?? 0;
    const total = counted?.total ?? 0;

    return {
      items,
      next: start + items.length < total ? (items.at(-1)?.id ?? null) : null,
      previous: start > 0 ? (items[0]?.id ?? null) : null,
      start,
      total,
    } satisfies NewestFirstPage<Row>;
  });
