# Long collections are paged by ID, newest first

An endpoint whose collection can grow without bound, such as an Organization's Contacts or a List's Subscriptions, returns one page at a time. The page is an object with the items and `next`, the ID of the last item when another page follows, or `null` on the last page. The client asks for the following page with `?after=<next>`. Items come newest first, ordered by ID, and the server fixes the page size (`PAGE_SIZE`, 50 items, in `packages/db/src/page.ts`). The query reads one row more than the page holds to know whether another page follows, so it never counts the whole collection.

We chose a cursor over offsets because a list of 150,000 Contacts changes while someone pages through it. An offset skips or repeats items when rows are added in front, and Postgres still reads every skipped row. Keyset paging by ID uses the index on `(organization_id, id)` or `(list_id, id)` and costs the same on the last page as on the first. IDs sort by creation time (ADR 0006), so ordering by ID is newest first without a second column in the cursor.

## Considered Options

- **Return the whole collection:** fine for an Organization's Lists, which stay few, and those endpoints still do. A large audience would make the response, the query and the dashboard's memory grow with it.
- **Offset and limit:** simple, but unstable while data changes and slower the deeper the page.
- **A cursor on `created_at` and ID:** sorts exactly by insert time, but the cursor has two parts and needs encoding. IDs already sort by the millisecond.

## Consequences

- Within one millisecond, IDs made by different requests sort in an order that isn't creation order, because on Workers each request has its own ID generator. Paging stays correct: each item appears exactly once.
- A client can't jump to page N or show a total from the page alone. A count, or search and filters (P1 user story 39 in #1), arrive as their own query parameters or endpoint.
- Short collections, such as Lists and Organizations, return a plain array. Changing one of them to a page later is a breaking change, so an endpoint picks paging when its collection can grow with an Organization's audience or sending.
- A `limit` parameter can be added later without breaking clients.
