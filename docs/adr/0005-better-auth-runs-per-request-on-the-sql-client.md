# Better Auth runs per request, behind our router, on the request's `SqlClient`

Better Auth is mounted as one route, `/api/auth/*`, in `ApiLive`. That route returns 404 for any method and path outside our allow list, resolves the client IP, and only then hands the request to Better Auth. It builds a Better Auth instance for each request from that request's ports: the `SqlClient`, `RateLimiter`, `SystemMailer` and `AuthConfig`. Better Auth reaches Postgres through its own Kysely adapter, given a Kysely instance whose driver reserves a connection from the Effect `SqlClient` for each Kysely connection (`packages/api/src/auth/kysely.ts`), so Better Auth's transactions, such as sign-up writing the user and its credential account, are real. We chose this because Effect's Postgres driver has no `pg` pool to hand Better Auth, Drizzle's Effect queries can't be awaited by Better Auth's Drizzle adapter, and ADR 0003 forbids a connection that outlives the request on Workers. Building Better Auth per request is cheap: it builds its router for every request anyway.

## Considered Options

- **A second Postgres pool (`pg`) for Better Auth:** two clients, and on Workers a pool tied to the first request, which ADR 0003 rules out.
- **A Better Auth adapter written against Drizzle's Effect API:** about 500 lines of query translation that Better Auth's Kysely adapter already has and tests.
- **Better Auth's Drizzle adapter over `drizzle-orm/pg-proxy`:** the proxy driver has no transactions and decodes values with codecs that don't match Effect's driver.

## Consequences

- Drizzle owns the auth tables' schema and migrations (`packages/db/src/schema.ts`). Better Auth's names are mapped to ours: plural tables through `modelName`, snake_case columns through Kysely's `CamelCasePlugin`. Better Auth's runtime schema check is off; the API tests exercise every table it writes.
- `SqlClient` is a request requirement of `ApiLive`, next to the ports.
- The per-account sign-in limit runs as a Better Auth `before` hook, so it counts only attempts that passed the per-IP limit and reads the body Better Auth parsed, JSON or form-encoded.
- The client IP reaches Better Auth only in `x-mailquilt-client-ip`, which our router sets from the configured header (`cf-connecting-ip` on Cloudflare, `CLIENT_IP_HEADER` on Docker) or the directly connected peer, replacing any value the client sent.
- A Better Auth upgrade that adds an endpoint fails a test until the endpoint is added to `DISABLED_AUTH_PATHS` or, deliberately, to the allow list.
