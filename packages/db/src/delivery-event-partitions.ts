import { DeliveryEventPartitions } from "@repo/core";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { Database } from "./database.ts";

/** Makes delivery events' monthly partitions with the function their migration defines. */
export const DeliveryEventPartitionsLive = Layer.effect(
  DeliveryEventPartitions,
  Effect.gen(function* deliveryEventPartitions() {
    const db = yield* Database;

    return {
      createAhead: (months) =>
        db
          .execute(sql`select create_delivery_event_partitions(${months})`)
          .pipe(Effect.orDie, Effect.asVoid),
    };
  })
);
