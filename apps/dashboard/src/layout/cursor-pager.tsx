import { Pagination } from "@cloudflare/kumo";
import { useEffect, useRef } from "react";

import { formatCount } from "../audience/format.ts";

/** The cursor a page step asks for: the rows after the last one shown, or before the first (ADR 0008). */
export type PageCursor<Id> = { readonly after: Id } | { readonly before: Id };

/**
 * A table's pager, for an API that pages by cursor: Kumo's `Pagination` with
 * its simple arrows, and the range and total on the left. It knows only
 * whether there's a page before and after, so a step asks for the rows
 * before the first or after the last one shown. Presses while the next page
 * loads are ignored.
 */
export const CursorPager = <Id,>({
  label,
  loading,
  next,
  onPage,
  previous,
  shown,
  start,
  total,
}: {
  /** What the pages are of, for the pager's name: "Pages of contacts". */
  label: string;
  loading: boolean;
  next: Id | null;
  onPage: (cursor: PageCursor<Id>) => void;
  previous: Id | null;
  /** How many rows this page shows. */
  shown: number;
  /** How many rows come before this page. */
  start: number;
  total: number;
}) => {
  const current = previous === null ? 1 : 2;
  const pager = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const atFirst = previous === null;
  const atLast = next === null;

  // WARNING: Kumo's arrows are plain disabled buttons. Reaching the first or last page turns off the arrow just pressed, and the browser drops focus to the page, so focus moves to the other arrow.
  useEffect(() => {
    const focused = document.activeElement;

    const lostFocus =
      focused === document.body ||
      (focused instanceof HTMLButtonElement &&
        focused.disabled &&
        pager.current?.contains(focused) === true);

    if (pressed.current && (atFirst || atLast) && lostFocus) {
      pager.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
    }

    pressed.current = false;
  }, [atFirst, atLast]);

  return (
    <div ref={pager}>
      <Pagination
        hasNextPage={next !== null}
        labels={{ navigation: label }}
        page={current}
        setPage={(asked) => {
          if (loading) {
            return;
          }

          pressed.current = true;

          if (asked < current && previous !== null) {
            onPage({ before: previous });
          } else if (asked > current && next !== null) {
            onPage({ after: next });
          }
        }}
      >
        <Pagination.Info className="tabular-nums">
          {() =>
            `${formatCount(start + 1)}–${formatCount(start + shown)} of ${formatCount(total)}`
          }
        </Pagination.Info>
        <Pagination.Controls controls="simple" />
      </Pagination>
    </div>
  );
};
