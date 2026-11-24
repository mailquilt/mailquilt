import { Context, Effect, Layer, Ref } from "effect";

import { Queue } from "./queue.ts";
import type { QueueMessage } from "./queue.ts";

/** The messages the in-process Queue holds, for tests to deliver when they choose. */
export class QueueInbox extends Context.Service<
  QueueInbox,
  {
    /** Every message not yet taken, oldest first, and empties the inbox. */
    readonly takeAll: Effect.Effect<readonly QueueMessage[]>;
  }
>()("@repo/core/testing/QueueInbox") {}

/** A Queue that keeps each message in an inbox in memory until a test takes it. */
export const InProcessQueueLive = Layer.effectContext(
  Effect.gen(function* inProcessQueue() {
    const inbox = yield* Ref.make<readonly QueueMessage[]>([]);

    return Context.make(Queue, {
      enqueue: (messages) =>
        Ref.update(inbox, (held) => [...held, ...messages]),
    }).pipe(Context.add(QueueInbox, { takeAll: Ref.getAndSet(inbox, []) }));
  })
);
