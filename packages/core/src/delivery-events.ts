import { Context, Effect } from "effect";

/** How many months ahead of this one delivery events always have a partition. */
export const PARTITION_MONTHS_AHEAD = 3;

/**
 * Port: the monthly partitions delivery events are written into. An event
 * for a month without one can't be written, so they're made ahead of time.
 */
export class DeliveryEventPartitions extends Context.Service<
  DeliveryEventPartitions,
  {
    /** Makes this month's partition and the next `months`', if missing. */
    readonly createAhead: (months: number) => Effect.Effect<void>;
  }
>()("@repo/core/DeliveryEventPartitions") {}

/**
 * Makes sure delivery events have partitions for this month and the next
 * three. Runs when the app starts and every day.
 */
export const createDeliveryEventPartitions = Effect.gen(
  function* createPartitions() {
    const partitions = yield* DeliveryEventPartitions;

    yield* partitions.createAhead(PARTITION_MONTHS_AHEAD);
  }
);
