import { currentOrganizationId, Preferences } from "@repo/core";
import { ListIdSchema } from "@repo/domain";
import { sql } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { Database } from "./database.ts";

interface PreferencesRow {
  readonly organization_name: string;
  readonly email: string;
  readonly opted_out: boolean;
  readonly lists: readonly {
    readonly id: string;
    readonly name: string;
    readonly subscribed: boolean;
  }[];
}

/**
 * The Subscriptions a preferences link changes, in Postgres. Every query is
 * scoped to the link's Organization and touches only Lists the Contact
 * already has a Subscription to. A failed query is a defect.
 */
export const PreferencesLive = Layer.effect(
  Preferences,
  Effect.gen(function* preferencesRepository() {
    const db = yield* Database;

    return {
      preferencesOf: (contactId) =>
        Effect.gen(function* findPreferences() {
          const organization = yield* currentOrganizationId;

          const { rows } = yield* db.execute<PreferencesRow>(sql`
            select
              o.name as organization_name,
              c.email,
              c.opted_out_at is not null as opted_out,
              coalesce(
                (
                  select json_agg(
                    json_build_object('id', l.id, 'name', l.name, 'subscribed', s.status = 'subscribed')
                    order by l.name, l.id
                  )
                  from subscriptions s
                  join lists l on l.organization_id = s.organization_id and l.id = s.list_id
                  where s.organization_id = c.organization_id and s.contact_id = c.id
                ),
                '[]'::json
              ) as lists
            from contacts c
            join organizations o on o.id = c.organization_id
            where c.organization_id = ${organization} and c.id = ${contactId}
          `);

          return Option.map(Option.fromNullishOr(rows[0]), (row) => ({
            email: row.email,
            lists: row.lists.map((list) => ({
              id: ListIdSchema.make(list.id),
              name: list.name,
              subscribed: list.subscribed,
            })),
            optedOut: row.opted_out,
            organizationName: row.organization_name,
          }));
        }).pipe(Effect.orDie),

      // WARNING: one statement, so lifting the Opt-out and unsubscribing the other Lists happen together or not at all; an Opt-out leaves Subscriptions as they were, and lifting it alone would start every one of them again.
      subscribe: (contactId, listId) =>
        Effect.gen(function* subscribe() {
          const organization = yield* currentOrganizationId;

          yield* db.execute(sql`
            with chosen as (
              select 1 from subscriptions
              where organization_id = ${organization}
                and contact_id = ${contactId}
                and list_id = ${listId}
            ),
            lifted as (
              update contacts set opted_out_at = null, updated_at = now()
              where organization_id = ${organization}
                and id = ${contactId}
                and opted_out_at is not null
                and exists (select 1 from chosen)
              returning 1
            ),
            others as (
              update subscriptions set status = 'unsubscribed', updated_at = now()
              where organization_id = ${organization}
                and contact_id = ${contactId}
                and list_id <> ${listId}
                and status <> 'unsubscribed'
                and exists (select 1 from lifted)
            )
            update subscriptions set status = 'subscribed', updated_at = now()
            where organization_id = ${organization}
              and contact_id = ${contactId}
              and list_id = ${listId}
              and status <> 'subscribed'
          `);
        }).pipe(Effect.orDie),

      unsubscribe: (contactId, listId) =>
        Effect.gen(function* unsubscribe() {
          const organization = yield* currentOrganizationId;

          yield* db.execute(sql`
            update subscriptions set status = 'unsubscribed', updated_at = now()
            where organization_id = ${organization}
              and contact_id = ${contactId}
              and list_id = ${listId}
              and status <> 'unsubscribed'
          `);
        }).pipe(Effect.orDie),
    };
  })
);
