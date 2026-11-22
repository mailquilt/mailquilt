# Long collections are paged by ID, newest first

An endpoint whose collection can grow without bound, such as an Organization's Contacts, returns one page at a time. Items come newest first, ordered by ID, and the server fixes the page size (`PAGE_SIZE`, 50 items, in `@repo/domain`, so the dashboard counts pages with the same number). The page holds:

- the items;
- `next`, the ID of its last item when an older page follows, and `previous`, the ID of its first item when a newer page precedes it, or `null` at either end;
- `total`, how many items the request's filters match, and `start`, how many of them come before this page, so a table can say "51–100 of 2,118".

The client asks for the older page with `?after=<next>` and the newer one with `?before=<previous>`, never both. The query reads one row more than the page holds to know whether another page follows on that side. Filters, such as a List or a Subscription status, are query parameters on the same endpoint, and `total` and `start` count with the same filters in one query.

We chose a cursor over offsets because a list of 150,000 Contacts changes while someone pages through it. An offset skips or repeats items when rows are added in front, and Postgres still reads every skipped row. Keyset paging by ID uses the index on `(organization_id, id)` and costs the same on the last page as on the first. IDs sort by creation time (ADR 0006), so ordering by ID is newest first without a second column in the cursor. Cursors on both sides keep the dashboard's Previous and Next stateless: each page's URL names its cursor, so a reload or a shared link shows the same page.

## Considered Options

- **Return the whole collection:** fine for an Organization's Lists, which stay few, and those endpoints still do. A large audience would make the response, the query and the dashboard's memory grow with it.
- **Offset and limit:** simple, but unstable while data changes and slower the deeper the page.
- **A cursor on `created_at` and ID:** sorts exactly by insert time, but the cursor has two parts and needs encoding. IDs already sort by the millisecond.
- **Only a forward cursor, with the client remembering earlier ones:** Previous would break on reload and in shared links.

## Consequences

- Within one millisecond, IDs made by different requests sort in an order that isn't creation order, because on Workers each request has its own ID generator. Paging stays correct: each item appears exactly once.
- Every page counts the matching rows. On an Organization's whole audience that is an index-only count, tens of milliseconds at 150,000 Contacts. If it grows too slow, `total` can become an estimate without changing the shape.
- A client can't jump to page N; the dashboard offers Previous and Next.
- Short collections, such as Lists and Organizations, return a plain array. Changing one of them to a page later is a breaking change, so an endpoint picks paging when its collection can grow with an Organization's audience or sending.
- Sorting by anything other than ID needs that column in the cursor, and is decided when it's needed.
