import { PgClient } from "@effect/sql-pg";
import { assert, layer } from "@effect/vitest";
import { DeliveryEventPartitions, PARTITION_MONTHS_AHEAD } from "@repo/core";
import { Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/sql";

import { DatabaseLive } from "../src/database.ts";
import { DeliveryEventPartitionsLive } from "../src/delivery-event-partitions.ts";
import { migrateDatabase } from "../src/migrate.ts";
import { emptyDatabase, PostgresLive } from "./postgres.ts";

const databaseWithCampaign = Effect.gen(function* databaseWithCampaign() {
  const url = yield* emptyDatabase;
  const client = PgClient.layer({ url: Redacted.make(url) });

  yield* migrateDatabase.pipe(
    Effect.provide(DatabaseLive),
    Effect.provide(client)
  );

  yield* Effect.gen(function* insertCampaign() {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`insert into organizations (id, name) values ('org_1', 'Acme')`;
    yield* sql`
      insert into campaigns (id, organization_id, subject, from_email, html)
      values ('cmp_1', 'org_1', 'Hello', 'news@acme.example', '<p>Hello</p>')`;
  }).pipe(Effect.provide(client));

  return Layer.mergeAll(
    client,
    DeliveryEventPartitionsLive.pipe(
      Layer.provide(DatabaseLive),
      Layer.provide(client)
    )
  );
});

const recordEventIn = (monthsFromNow: number) =>
  Effect.gen(function* recordEvent() {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`
      insert into delivery_events (organization_id, campaign_id, contact_id, kind, occurred_at)
      values ('org_1', 'cmp_1', 'cnt_1', 'sent', now() + make_interval(months => ${monthsFromNow}))`;
  });

layer(PostgresLive, { timeout: "2 minutes" })(
  "Delivery event partitions",
  (test) => {
    test.effect(
      `holds events from this month to ${PARTITION_MONTHS_AHEAD} months ahead once migrated, and later months once made`,
      () =>
        Effect.gen(function* partitionsAhead() {
          const database = yield* databaseWithCampaign;

          yield* Effect.gen(function* recordAcrossMonths() {
            yield* Effect.forEach(
              [0, 1, 2, PARTITION_MONTHS_AHEAD],
              recordEventIn
            );

            const beyond = yield* recordEventIn(
              PARTITION_MONTHS_AHEAD + 1
            ).pipe(Effect.flip);

            const partitions = yield* DeliveryEventPartitions;

            yield* Effect.all(
              [
                partitions.createAhead(PARTITION_MONTHS_AHEAD + 1),
                partitions.createAhead(PARTITION_MONTHS_AHEAD + 1),
              ],
              { concurrency: "unbounded" }
            );

            yield* recordEventIn(PARTITION_MONTHS_AHEAD + 1);

            assert.strictEqual(beyond._tag, "SqlError");
          }).pipe(Effect.provide(database));
        })
    );
  }
);
