import type { ContactFilter } from "@repo/core";
import { Contacts, CurrentOrganization } from "@repo/core";
import type { ListId, OrganizationId } from "@repo/domain";
import {
  Contact,
  ContactAlreadyExists,
  ContactPage,
  newContactId,
  newSubscriptionId,
} from "@repo/domain";
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { PAGE_SIZE } from "./page.ts";
import { requireLists } from "./require-lists.ts";
import { contacts, subscriptions } from "./schema.ts";

const decodeContact = Schema.decodeUnknownEffect(Contact);

const decodePage = Schema.decodeUnknownEffect(ContactPage);

interface SubscriptionRow {
  readonly contactId: string;
  readonly listId: string;
  readonly status: string;
  readonly createdAt: Date;
}

interface ContactRow {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

const contactColumns = {
  createdAt: contacts.createdAt,
  email: contacts.email,
  id: contacts.id,
};

const subscriptionColumns = {
  contactId: subscriptions.contactId,
  createdAt: subscriptions.createdAt,
  listId: subscriptions.listId,
  status: subscriptions.status,
};

const toContact = (
  row: ContactRow,
  subscriptionRows: readonly SubscriptionRow[]
) => ({
  createdAt: DateTime.fromDateUnsafe(row.createdAt),
  email: row.email,
  id: row.id,
  subscriptions: subscriptionRows.map((subscription) => ({
    createdAt: DateTime.fromDateUnsafe(subscription.createdAt),
    listId: subscription.listId,
    status: subscription.status,
  })),
});

const contactsMatching = (
  organization: OrganizationId,
  filter: ContactFilter
) => {
  const status =
    filter.status === undefined
      ? sql``
      : sql`and ${subscriptions.status} = ${filter.status}`;

  return and(
    eq(contacts.organizationId, organization),
    filter.list === undefined
      ? undefined
      : sql`exists (select 1 from ${subscriptions} where ${subscriptions.organizationId} = ${organization} and ${subscriptions.contactId} = ${contacts.id} and ${subscriptions.listId} = ${filter.list} ${status})`
  );
};

/**
 * An Organization's Contacts in Postgres. Every query is scoped to the
 * request's `CurrentOrganization`. A failed query is a defect.
 */
export const ContactsLive = Layer.effect(
  Contacts,
  Effect.gen(function* contactsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    const withRandom = Effect.provideService(SecureRandom.SecureRandom, random);

    const subscriptionsOf = (
      organization: OrganizationId,
      ids: readonly string[]
    ) =>
      ids.length === 0
        ? Effect.succeed(new Map<string, SubscriptionRow[]>())
        : db
            .select(subscriptionColumns)
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.organizationId, organization),
                inArray(subscriptions.contactId, [...ids])
              )
            )
            .orderBy(asc(subscriptions.createdAt), asc(subscriptions.id))
            .pipe(
              Effect.orDie,
              Effect.map((rows) => {
                const byContact = new Map<string, SubscriptionRow[]>();

                for (const row of rows) {
                  byContact.set(row.contactId, [
                    ...(byContact.get(row.contactId) ?? []),
                    row,
                  ]);
                }

                return byContact;
              })
            );

    const newestFirstPageAroundCursor = (
      organization: OrganizationId,
      filter: ContactFilter
    ) => {
      const where = contactsMatching(organization, filter);

      if (filter.before !== undefined) {
        return db
          .select(contactColumns)
          .from(contacts)
          .where(and(where, gt(contacts.id, filter.before)))
          .orderBy(asc(contacts.id))
          .limit(PAGE_SIZE + 1)
          .pipe(
            Effect.orDie,
            Effect.map((rows) => {
              const items = rows.slice(0, PAGE_SIZE).toReversed();

              return {
                items,
                next: items.at(-1)?.id ?? null,
                previous:
                  rows.length > PAGE_SIZE ? (items[0]?.id ?? null) : null,
              };
            })
          );
      }

      return db
        .select(contactColumns)
        .from(contacts)
        .where(
          and(
            where,
            filter.after === undefined
              ? undefined
              : lt(contacts.id, filter.after)
          )
        )
        .orderBy(desc(contacts.id))
        .limit(PAGE_SIZE + 1)
        .pipe(
          Effect.orDie,
          Effect.map((rows) => {
            const items = rows.slice(0, PAGE_SIZE);

            return {
              items,
              next: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null,
              previous:
                filter.after === undefined ? null : (items[0]?.id ?? null),
            };
          })
        );
    };

    return {
      create: (email, listIds) =>
        Effect.gen(function* createContact() {
          const organization = (yield* CurrentOrganization).id;
          const lists = [...new Set<ListId>(listIds)];

          yield* requireLists(db, organization, lists);

          const id = yield* withRandom(newContactId);

          const subscriptionIds = yield* Effect.all(
            lists.map(() => withRandom(newSubscriptionId))
          );

          const { contact, subscribed } = yield* db
            .transaction((tx) =>
              Effect.gen(function* insertContact() {
                const [created] = yield* tx
                  .insert(contacts)
                  .values({ email, id, organizationId: organization })
                  .onConflictDoNothing()
                  .returning(contactColumns)
                  .pipe(Effect.orDie);

                if (created === undefined) {
                  return yield* new ContactAlreadyExists();
                }

                const rows =
                  lists.length === 0
                    ? []
                    : yield* tx
                        .insert(subscriptions)
                        .values(
                          lists.map((listId, index) => ({
                            contactId: id,
                            id: subscriptionIds[index] ?? "",
                            listId,
                            organizationId: organization,
                            status: "subscribed",
                          }))
                        )
                        .returning({
                          ...subscriptionColumns,
                          id: subscriptions.id,
                        })
                        .pipe(Effect.orDie);

                return {
                  contact: created,
                  subscribed: rows.toSorted((a, b) => (a.id < b.id ? -1 : 1)),
                };
              })
            )
            .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));

          return yield* decodeContact(toContact(contact, subscribed)).pipe(
            Effect.orDie
          );
        }),

      page: (filter) =>
        Effect.gen(function* contactPage() {
          const organization = (yield* CurrentOrganization).id;

          if (filter.list !== undefined) {
            yield* requireLists(db, organization, [filter.list]);
          }

          const { items, next, previous } = yield* newestFirstPageAroundCursor(
            organization,
            filter
          );

          const first = items[0]?.id;

          const [counted] = yield* db
            .select({
              start:
                first === undefined
                  ? sql<number>`count(*)::int`
                  : sql<number>`(count(*) filter (where ${contacts.id} > ${first}))::int`,
              total: sql<number>`count(*)::int`,
            })
            .from(contacts)
            .where(contactsMatching(organization, filter))
            .pipe(Effect.orDie);

          const subscriptionsByContact = yield* subscriptionsOf(
            organization,
            items.map((item) => item.id)
          );

          return yield* decodePage({
            contacts: items.map((item) =>
              toContact(item, subscriptionsByContact.get(item.id) ?? [])
            ),
            next,
            previous,
            start: counted?.start ?? 0,
            total: counted?.total ?? 0,
          }).pipe(Effect.orDie);
        }),
    };
  })
);
