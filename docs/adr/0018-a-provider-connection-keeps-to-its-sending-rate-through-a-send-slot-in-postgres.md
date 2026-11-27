# A Provider Connection keeps to its sending rate through a send slot in Postgres

A Provider Connection can have a sending rate, in emails a minute, so an SMTP relay with a limit isn't overwhelmed and an SES account isn't throttled (#18). Every email sent through it, from any Campaign, any batch and any process, keeps to that rate.

Each connection with a rate has one row in `send_slots`, holding when it may next start an email. Before claiming a recipient, a batch takes the slot in one statement: the slot starts at that time or now, whichever is later, and the row moves on by one interval (a minute divided by the rate). The batch then waits until its slot starts, claims the recipient and sends. A second batch taking the slot at the same moment waits for the first's row lock and moves on from where it left the slot, so no two emails share a slot, and each slot starts one interval after the last. What's spaced is the slots: the claim and the email's links take a few milliseconds after each, so two emails can leave a little less than an interval apart, but never more of them in a minute than the rate, give or take one. The slot is taken before the claim, so a long wait never makes the claim old enough for another delivery to take it as cut off (ADR 0014).

The rate is a whole number from 10 to 60,000 a minute. At the slowest, a batch of 100 waits out 10 minutes, which fits a Workers consumer invocation's 15. A connection without a rate isn't paced, and its batches take no slot.

## Considered Options

- **Waiting between emails inside a batch:** no table and no statement, and right today, since one batch sends at a time on each runtime. But a second Docker replica would double the real rate, two Campaigns' batches would each keep the rate on their own, and on Workers each batch starts afresh, so two emails could leave back to back.
- **The `RateLimiter` port's fixed windows:** already in Postgres, but a window lets its whole count out at once at the start of each window, and SES counts its limit per second.

## Consequences

- An email through a paced connection costs one more statement, the slot, on top of its claim and outcome.
- The slot follows the app's clock, not Postgres's, as claims do, so tests pace with `TestClock`.
- A batch's emails wait for their slots in turn, so a slow rate makes a batch take longer: at 10 a minute, about 10 minutes for 100. pg-boss's deadline for a batch allows for the longest wait at the slowest rate as well as each email's send timeout.
- A batch that wakes after its slot has started, because Postgres or the process stalled, sends at once rather than taking a later slot, and its next slot starts from then. So after a stall, each batch that was waiting can send one email at the same moment, a burst of at most one per batch sending through the connection, before the slots space them again. One batch sends at a time on each runtime, so that's usually one. A Provider that's sent too much at once puts it off, as SES does with 429 (#18), and the email is tried on the batch's next delivery.
- A pause or cancel stops a batch at its next claim, so one email already waiting for its slot still checks before it's sent.
- Deleting a connection deletes its slot. A batch still holding the deleted connection's settings takes no slot and sends without waiting, as it already sends with the settings it read.
