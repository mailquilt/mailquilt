# Tenant endpoints name the Organization in the path; membership is checked on every request

An endpoint for one Organization's data lives under `/api/organizations/:organizationId/…`. Each request runs `asMemberOf(organizationId)` (`packages/core/src/organizations.ts`). It checks that the signed-in person is a member, then provides `CurrentOrganization`. Every repository method for tenant data requires `CurrentOrganization` in its Effect type. Only `@repo/core` provides it: `asMemberOf` for a request, `asQueuedFor` for a queue message the app sent itself (ADR 0014), and the unsubscribe and preferences use cases for a link whose signed token names the Organization (ADR 0016). `@repo/core` exports `CurrentOrganization`, and `CurrentMembership` with it, as types only, and repositories read them through `currentOrganizationId` and `currentRole`. Another package could provide them only by going around the type checker, with a cast or Effect's `Context.makeUnsafe`, which review refuses. So a handler that forgets the check doesn't compile. A non-member gets the same 404 (`OrganizationNotFound`) as someone asking for an ID that doesn't exist, so an ID never reveals another tenant.

We chose the path over Better Auth's "active organization" stored on the session because the session is shared by every tab. An agency with one tab per brand would switch the session in one tab and send the other tab's imports and Campaigns into the wrong Organization. With the ID in each request, a tab works in whichever Organization it names. The dashboard remembers that choice per tab in session storage, and the last choice in local storage for new tabs. The path also puts the Organization in the contract, so the typed client and the OpenAPI document show it.

The check is a wrapper in the handler rather than an `HttpApiMiddleware`, because Effect types a middleware's own requirements as build-time services. The check reads Postgres and Better Auth, which are request requirements (ADR 0003, ADR 0005), and a middleware could only reach them through a cast that hides a missing port from the type checker.

## Considered Options

- **Better Auth's organization plugin and `activeOrganizationId` on the session:** the tab problem above. Its create endpoint also needs a slug Mailquilt has no use for, makes the Organization and its owner in separate statements, and uses Better Auth's IDs (ADR 0006). The plugin can still come later for invitations, writing to the same `organizations` and `members` tables.
- **An `Organization` header on every request:** keeps paths short, but hides the Organization from the contract and needs client middleware to set it.
- **Postgres row-level security:** not used (`docs/agents/decisions.md`).
- **A lint rule against providing `CurrentOrganization` outside `asMemberOf`:** catches the same mistake, but only where the rule matches the code's shape, and only in lint. Exporting the type alone lets the type checker refuse it everywhere.

## Consequences

- `packages/api/test/scope-tags.test.ts` fails the type check, and the test itself, if `@repo/core` exports `CurrentOrganization`, `CurrentMembership` or `InstanceAdmin` as a value again.
- `CurrentUser` is still exported as a value, because `signedIn` (`packages/api/src/auth/signed-in.ts`) provides it after Better Auth checks the session, and it's the only place that does. Moving that check behind a port in core, so `CurrentUser` can be a type only too, is on #158.
- `packages/api/test/organization-isolation.test.ts` calls every endpoint under `/organizations/:organizationId` as a member of another Organization. Its first test fails until each such endpoint has a case, so every ticket that adds tenant data extends it.
- An API key (P1) belongs to one Organization. A request with a key must name that same Organization in the path.
- Writes authenticated by the session cookie are refused when `Origin` names another site, so a page on a sibling domain can't use the cookie.
