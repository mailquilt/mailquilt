/** How many items one page of a long collection holds (ADR 0008). */
export const PAGE_SIZE = 50;

/**
 * Turns up to `PAGE_SIZE + 1` rows, newest first, into one page: the first
 * `PAGE_SIZE` rows, and the cursor for the next page if there was one more.
 */
export const toPage = <Row extends { readonly id: string }>(
  rows: readonly Row[]
) => {
  const items = rows.slice(0, PAGE_SIZE);

  return {
    items,
    next: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null,
  };
};
