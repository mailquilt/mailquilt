import { Context } from "effect";
import type { DateTime, Effect } from "effect";

import type { QueueMessage } from "./queue.ts";

/**
 * Port: hands a message to the runtime's queue to be delivered, as `Queue`
 * delivers it, once `at` has come: on Node a pg-boss job that starts after
 * it, on Workers an outbox row the Cron Trigger forwards once it's due, a
 * minute late at most, to wait behind any messages already queued. Like `enqueue`, it joins the database
 * transaction it runs in (ADR 0017). It can't be taken back, so the
 * message's handler checks it's still wanted.
 */
export class Scheduler extends Context.Service<
  Scheduler,
  {
    readonly schedule: (
      message: QueueMessage,
      at: DateTime.Utc
    ) => Effect.Effect<void>;
  }
>()("@repo/core/Scheduler") {}
