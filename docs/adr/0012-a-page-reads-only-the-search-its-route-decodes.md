# A page reads only the search its route decodes

Some dashboard pages keep what they show in the address, such as Contacts' List, status and page, so a reload, Back or a shared link shows the same thing. Each such route decodes its search with Effect Schema in `validateSearch` and drops a part that doesn't parse, such as an edited or out-of-date ID, rather than failing the page.

TanStack Router doesn't hand the page what `validateSearch` returned. It merges it over the address's search (`{ ...fromAddress, ...decoded }`), so a key the decoder leaves out keeps its raw value. Before this, `/contacts?list=foo` reached the Contacts page as `{ list: "foo" }`, which the API rejects, and the page showed an error after its retries.

So a route that decodes its search also checks it in `beforeLoad`: it decodes the search again, and when the result differs, it redirects to the decoded search. The router follows a redirect by replacing the history entry, so Back doesn't return to the bad address. A valid address decodes to itself and loads with no redirect. `validateSearch` gets the decoder itself, not an arrow around it: next to an unannotated `beforeLoad`, an arrow lets TypeScript infer the route's search as `{}`.

## Considered Options

- **Return a dropped key as `undefined`:** the merge then overwrites the raw value, but the page gets `{ list: undefined }`, which the API client's `Schema.optionalKey` query rejects, and an unknown key still gets through.
- **The router's `search.strict` option:** it applies only when building a link or a navigation, not when the page first reads the address.
- **Throw from `validateSearch`:** the route's error component shows instead of the page, for a part the person can't see in the address bar or fix.

## Consequences

- The address bar always matches what the page shows; a cleaned address replaces the bad one.
- A new route with a search in the address adds the same `beforeLoad` check. A test loads the real route tree at a bad address and checks what the page's search and the address become.
- The email-verified page doesn't follow this yet: its search schema throws on an `error` that isn't text, such as `?error=1`, and shows the route's error component. Only a hand-edited link does that; bringing it under this rule is its own change.
