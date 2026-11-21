# Writing tests

Each test should fail for one reason no other test fails for. Before adding a test, search for one that already covers the same code, and extend it instead.

## Where a test goes

Mail Quilt has three test seams. Use the highest one that can see the rule.

1. **The public API, in process.** Most tests live here. The test calls the app through the typed client generated from `contract`, with the `HttpApi` running in the test process and a real Postgres from Testcontainers. Every other port uses its fake: the recording Provider, the in-process Queue, `TestClock`, in-memory Storage, the Captcha and DNS fakes, the System Mailer outbox. Write these with `@effect/vitest` (`it.effect`, `it.layer`), so waits, retries and rate-limit windows run without real time passing.
2. **The Provider port.** One shared contract suite runs against every Provider adapter: recorded HTTP responses and webhook payloads, and Mailpit for SMTP.
3. **The deployment.** One Playwright smoke test per deployment target signs in, sends a Campaign and checks it arrives in Mailpit. It proves the pieces are wired together. Don't add rules to it.

Dashboard tests render a component in happy-dom with Testing Library. They keep the typed client real and answer its requests with MSW, so they show how the UI handles each result the API can return, not the rules behind it.

Small direct unit tests are only for pure rules with many cases, such as how DNS results are classified, how tokens are signed and checked, CSV formula escaping, and merge-tag rendering and escaping.

## Never fake the database

Persistence is always tested against real Postgres. An in-memory repository drifts from the real SQL and hides exactly the bugs that matter here: a missing Organization scope, a query per Contact, a broken migration.

## Test each rule once

- Test a rule at the seam that owns it, once. A dashboard or smoke test shows the UI handles the result; it doesn't repeat the list of values.
- When several things share a code path, such as every Provider's retry handling, test the path once with one representative, and per item only what it adds. Read the source to confirm the path really is shared.
- In `it.each` and loops, every row should reach a different branch or limit. Values that fail the same check are one case.

## Don't test

- Constants, labels, field lists or CSS values, unless the value is a promise to users or the API.
- Libraries: Effect, Effect Schema, Drizzle, Better Auth or the browser doing what their docs say.
- Compatibility with data, keys or API shapes no release has had.

## Always keep

- **Security checks:** the full table of values where the check lives, and one case wherever it's used. This covers tokens, the outbound guard, escaping, the Better Auth allow list, rate limits and re-confirmation.
- **Organization isolation:** every new endpoint gets a case in the cross-Organization suite.
- **Consent rules:** who is and isn't sent a Campaign, for every reason someone is left out.
- **The public contract:** the API, its errors, and anything a self-hoster's data depends on, including migrations.
- **Accessibility checks,** and the only test of an edge case or a past bug.

## See it fail first

- A test for a bug is written before the fix, and seen failing for the reason the bug gives. The pull request says so.
- A test for new behaviour is seen failing with the behaviour taken out. Copy the file aside to try it. Don't stash.
- A test that passes with its code removed checks nothing. Fix it or delete it.

## Flaky tests

A flaky test is a bug, not bad luck. Don't retry it into passing. Find the cause, such as a real clock, an unawaited Effect, shared state between tests or a dependency version CI didn't lock, and fix it, or quarantine it with an issue.

## Naming

Name a test for the behaviour it checks, using `GLOSSARY.md` terms. Not for the ticket, review or library it came from.
