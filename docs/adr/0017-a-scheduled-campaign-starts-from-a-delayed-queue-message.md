# A scheduled Campaign starts from a delayed queue message

A member can schedule a Campaign to start sending at a date and time in a time zone they choose (#16). Something has to start it when that time comes, on Node and on Workers, without a request to start from.

Scheduling hands a `StartScheduledCampaign` message to the `Scheduler` port (`packages/core/src/scheduler.ts`), which delivers it, as the `Queue` delivers any message, once its time has come. Like `enqueue`, `schedule` joins the database transaction it runs in, so the message exists exactly when the Campaign's move to `scheduled` commits (ADR 0014):

- **Node:** a pg-boss job in the same queue as the batches, with `startAfter` set to the time. pg-boss keeps a job that hasn't started for 14 days counted from `startAfter`, not from when it was made, so a schedule months ahead isn't deleted before it's due.
- **Workers:** a `queue_outbox` row with `deliver_after` set to the time. A forward hands over only rows that are due, so the Cron Trigger that already forwards the outbox every minute sends it to Cloudflare Queues within a minute of its time. Cloudflare Queues' own delay can't be used: it's at most a day (86,400 seconds in the Miniflare the repo installs), and a schedule can be further ahead.

The message names the Organization, so its handler runs inside `asQueuedFor` and every query stays scoped to that Organization (ADR 0007, ADR 0014). It also names the time it was scheduled for. A message can't be taken back, so the handler starts the Campaign only if it's still `scheduled` for exactly that time. A schedule that was cancelled or moved, or a Campaign that already started, leaves an old message with nothing to do.

## Considered Options

- **A cron job that looks for due Campaigns every minute**, as #16 first described (pg-boss cron on Node, the Cron Trigger on Workers): it has to read every Organization's Campaigns at once, which is the unscoped query path for tenant data that ADR 0007 rules out, and it adds a scan of the Campaigns table every minute forever.
- **A `deliverAt` option on `Queue.enqueue`:** one port instead of two, but every caller of `enqueue` would carry an option only scheduling uses, and the plan already names a Scheduler (`architecture.md`).

## Consequences

- On Node a scheduled Campaign's job becomes due at its time and is taken at pg-boss's next poll, every 2 seconds, once the one worker is free: a batch already being sent finishes first. pg-boss takes the oldest job first, so it goes ahead of batches queued after it was scheduled. On Workers the next Cron Trigger, up to a minute later, puts it at the back of the Cloudflare Queue, whose one consumer takes one message at a time, so it also waits behind any batches already queued, such as those of a large Campaign sending then.
- Cancelling or moving a schedule leaves its old message in pg-boss or the outbox until it's due. It then does nothing.
- When a Campaign can't start at its time, because its Provider Connection was deleted or no one would get it, the handler makes it a draft again and records why on the Campaign, so its page can say so (`schedule.missed`). A postal address can't be missing then: scheduling needs one, and one can't be removed. A failure that isn't one of these, such as Postgres being unreachable, fails the message, which the queue delivers again (ADR 0014). After its last retry, about 15 minutes, the message is dropped as a batch is, and the Campaign stays `scheduled` at a time that has passed, with nothing saying why, until a member cancels or moves its schedule.
- Tests deliver a scheduled message from the in-process queue once the test's `TestClock` reaches its time.
