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
                select l.name from campaign_lists cl
                join lists l on l.organization_id = cl.organization_id and l.id = cl.list_id
                join subscriptions s on s.organization_id = cl.organization_id
                  and s.list_id = cl.list_id
                  and s.contact_id = c.id
                where cl.organization_id = cmp.organization_id
                  and cl.campaign_id = cmp.id
                  and not cl.excluded
                order by l.name
              ) as list_names,
              exists(
                select 1 from subscriptions s
                join campaign_lists cl on cl.organization_id = s.organization_id
                  and cl.list_id = s.list_id
                  and cl.campaign_id = cmp.id
                  and not cl.excluded
                where s.organization_id = cmp.organization_id
                  and s.contact_id = c.id
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
                select list_id from campaign_lists
                where organization_id = ${organization}
                  and campaign_id = ${campaignId}
                  and not excluded
              )
          `);
        }).pipe(Effect.orDie),
    };
  })
);
