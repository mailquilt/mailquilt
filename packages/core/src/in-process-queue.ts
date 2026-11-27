import { Clock, Context, DateTime, Effect, Layer, Ref } from "effect";

import { Queue } from "./queue.ts";
import type { QueueMessage } from "./queue.ts";
import { Scheduler } from "./scheduler.ts";

/** The messages the in-process Queue holds, for tests to deliver when they choose. */
export class QueueInbox extends Context.Service<
  QueueInbox,
  {
    /**
     * Every message that's due by the `Clock`, in the order they were
     * queued, taking them out of the inbox. A scheduled message stays until its time comes.
     */
    readonly takeAll: Effect.Effect<readonly QueueMessage[]>;
  }
>()("@repo/core/testing/QueueInbox") {}

interface Held {
  readonly message: QueueMessage;
  readonly dueAtMillis: number;
}

/**
 * A Queue and Scheduler that keep each message in an inbox in memory until
 * a test takes it, a scheduled one once the test's `Clock` reaches its time.
 */
export const InProcessQueueLive = Layer.effectContext(
  Effect.gen(function* inProcessQueue() {
    const inbox = yield* Ref.make<readonly Held[]>([]);

    const hold = (held: readonly Held[]) =>
      Ref.update(inbox, (earlier) => [...earlier, ...held]);

    const takeAll = Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) =>
        Ref.modify(inbox, (held) => [
          held
            .filter((entry) => entry.dueAtMillis <= now)
            .map((entry) => entry.message),
          held.filter((entry) => entry.dueAtMillis > now),
        ])
      )
    );

    return Context.make(Queue, {
      enqueue: (messages) =>
        hold(messages.map((message) => ({ dueAtMillis: 0, message }))),
    }).pipe(
      Context.add(Scheduler, {
        schedule: (message, at) =>
          hold([{ dueAtMillis: DateTime.toEpochMillis(at), message }]),
      }),
      Context.add(QueueInbox, { takeAll })
    );
  })
);
