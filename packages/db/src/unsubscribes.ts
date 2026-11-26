import { currentOrganizationId, Unsubscribes } from "@repo/core";
import { sql } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { Database } from "./database.ts";

interface UnsubscriptionRow {
  readonly organization_name: string;
  readonly email: string;
  readonly list_names: readonly string[];
  readonly subscribed: boolean;
  readonly opted_out: boolean;
}

/**
 * The Subscriptions and Opt-outs an unsubscribe link acts on, in Postgres.
 * Every query is scoped to the link's Organization. A failed query is a
 * defect.
 */
export const UnsubscribesLive = Layer.effect(
  Unsubscribes,
  Effect.gen(function* unsubscribesRepository() {
    const db = yield* Database;

    return {
      unsubscriptionOf: (campaignId, contactId) =>
        Effect.gen(function* findUnsubscription() {
          const organization = yield* currentOrganizationId;

          const { rows } = yield* db.execute<UnsubscriptionRow>(sql`
            select
              o.name as organization_name,
              c.email,
              array(
                select l.name from lists l
                where l.organization_id = cmp.organization_id and l.id = cmp.list_id
              ) as list_names,
              exists(
                select 1 from subscriptions s
                where s.organization_id = cmp.organization_id
                  and s.contact_id = c.id
                  and s.list_id = cmp.list_id
                  and s.status <> 'unsubscribed'
              ) as subscribed,
              c.opted_out_at is not null as opted_out
            from campaigns cmp
            join organizations o on o.id = cmp.organization_id
            join contacts c on c.organization_id = cmp.organization_id and c.id = ${contactId}
            where cmp.organization_id = ${organization} and cmp.id = ${campaignId}
          `);

          return Option.map(Option.fromNullishOr(rows[0]), (row) => ({
            email: row.email,
            listNames: row.list_names,
            optedOut: row.opted_out,
            organizationName: row.organization_name,
            subscribed: row.subscribed,
          }));
        }).pipe(Effect.orDie),

      optOut: (contactId) =>
        Effect.gen(function* optOut() {
          const organization = yield* currentOrganizationId;

          yield* db.execute(sql`
            update contacts set opted_out_at = now(), updated_at = now()
            where organization_id = ${organization}
              and id = ${contactId}
              and opted_out_at is null
          `);
        }).pipe(Effect.orDie),

      unsubscribe: (campaignId, contactId) =>
        Effect.gen(function* unsubscribe() {
          const organization = yield* currentOrganizationId;

          yield* db.execute(sql`
            update subscriptions set status = 'unsubscribed', updated_at = now()
            where organization_id = ${organization}
              and contact_id = ${contactId}
              and status <> 'unsubscribed'
              and list_id in (
                select list_id from campaigns
                where organization_id = ${organization} and id = ${campaignId}
              )
          `);
        }).pipe(Effect.orDie),
    };
  })
);
