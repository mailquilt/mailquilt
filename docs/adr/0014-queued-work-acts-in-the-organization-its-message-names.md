# Queued work acts in the Organization its message names

Work that runs after a request, such as sending a Campaign's batches, goes through the `Queue` port (`packages/core/src/queue.ts`). Every `QueueMessage` names the Organization it acts in, and its handler runs inside `asQueuedFor(message)`, which provides `CurrentOrganization` from that ID. The message is trusted because only the app sends queue messages, from a request that already passed `asMemberOf` for that Organization; nobody outside the app can write to pg-boss's tables or a Cloudflare Queue. So the same repositories, scoped by `CurrentOrganization` (ADR 0007), serve requests and queued work, and there's still no unscoped query path for tenant data.

`CurrentOrganization` now holds only the Organization's ID. The signed-in person's role moved to `CurrentMembership`, which only `asMemberOf` provides, because queued work acts for the Organization, not for a member: a role copied into a message would be stale by the time it runs.

Delivery is at least once. A handler works from state in Postgres, not from the message, so a message delivered again skips work already recorded: a Campaign batch sends only to recipients still `queued`. It can still repeat work that happened but wasn't recorded: a batch records its outcomes once it has tried every recipient, so if the process stops after the Provider accepted some of them and before that write, the next delivery sends them again. On Node, `enqueue` writes the messages through the app's own `SqlClient`, so they join the database transaction it runs in: a Campaign's messages exist exactly when its move to `sending` and its recipient snapshot commit. A consumer can't pick a message up before the rows it points at are visible, and a failed enqueue rolls the send back, leaving a draft.

## Considered Options

- **A separate, unscoped repository for workers:** a second query path for tenant data that ADR 0007 rules out, and every repository method written twice.
- **Enqueue after the transaction commits:** works on every queue, but a crash or a queue outage between the commit and the enqueue leaves a Campaign `sending` with nothing queued to send it.
- **Enqueue inside the transaction through pg-boss's own pool:** pg-boss could deliver the message before the transaction commits, and the consumer would find no recipients yet.

## Consequences

- Every new kind of queue message is a `Schema.TaggedClass` with an `organizationId`, added to the `QueueMessage` union, and handled in `handleQueueMessage` inside `asQueuedFor`.
- Cloudflare Queues (#11) can't join a Postgres transaction. Its adapter has to enqueue after the commit, or keep an outbox table in the same transaction and forward from it; #11 decides which and records it here.
- A recipient can be sent a Campaign twice: when the process stops between the Provider accepting their email and the batch recording it, or when two deliveries of one batch run at the same moment. A batch's job expires only after every email in it could have taken its full send timeout, so a slow Provider can't make pg-boss start a second attempt beside the first. Making a send happen at most once per recipient, with an idempotency key and progress recorded in smaller steps, is #17.
- #113 (make `asMemberOf` the only source of `CurrentOrganization`) now has two legitimate sources, `asMemberOf` and `asQueuedFor`.
