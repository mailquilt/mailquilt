import { CurrentOrganization, Lists } from "@repo/core";
import type { ListId, OrganizationId } from "@repo/domain";
import {
  AddedToList,
  ContactNotFound,
  List,
  ListNotFound,
  newListId,
  newSubscriptionId,
} from "@repo/domain";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { requireLists } from "./require-lists.ts";
import { contacts, lists, subscriptions } from "./schema.ts";

const decodeList = Schema.decodeUnknownEffect(List);

const decodeLists = Schema.decodeUnknownEffect(Schema.Array(List));

const decodeAddedToList = Schema.decodeUnknownEffect(AddedToList);

const countWithStatus = (status: string) =>
  sql<number>`(count(${subscriptions.id}) filter (where ${subscriptions.status} = ${status}))::int`;

const listColumns = {
  createdAt: lists.createdAt,
  id: lists.id,
  name: lists.name,
  pending: countWithStatus("pending"),
  subscribed: countWithStatus("subscribed"),
  unsubscribed: countWithStatus("unsubscribed"),
};

interface ListRow {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly subscribed: number;
  readonly pending: number;
  readonly unsubscribed: number;
}

const toList = (row: ListRow) => ({
  createdAt: DateTime.fromDateUnsafe(row.createdAt),
  id: row.id,
  name: row.name,
  subscriptions: {
    pending: row.pending,
    subscribed: row.subscribed,
    unsubscribed: row.unsubscribed,
  },
});

/**
 * An Organization's Lists in Postgres, each with how many of its
 * Subscriptions have each status. Every query is scoped to the request's
 * `CurrentOrganization`. A failed query is a defect.
 */
export const ListsLive = Layer.effect(
  Lists,
  Effect.gen(function* listsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    const withRandom = Effect.provideService(SecureRandom.SecureRandom, random);

    const listsWithCounts = (organization: OrganizationId, id?: ListId) =>
      db
        .select(listColumns)
        .from(lists)
        .leftJoin(
          subscriptions,
          and(
            eq(subscriptions.organizationId, lists.organizationId),
            eq(subscriptions.listId, lists.id)
          )
        )
        .where(
          and(
            eq(lists.organizationId, organization),
            id === undefined ? undefined : eq(lists.id, id)
          )
        )
        .groupBy(lists.id)
        .orderBy(asc(lists.createdAt), asc(lists.id))
        .pipe(Effect.orDie);

    return {
      addContacts: (listId, contactIds) =>
        Effect.gen(function* addContacts() {
          const organization = (yield* CurrentOrganization).id;
          const unique = [...new Set(contactIds)];

          yield* requireLists(db, organization, [listId]);

          const [found] = yield* db
            .select({ found: count() })
            .from(contacts)
            .where(
              and(
                eq(contacts.organizationId, organization),
                inArray(contacts.id, unique)
              )
            )
            .pipe(Effect.orDie);

          if (found?.found !== unique.length) {
            return yield* new ContactNotFound();
          }

          const existing = yield* db
            .select({
              contactId: subscriptions.contactId,
              status: subscriptions.status,
            })
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.organizationId, organization),
                eq(subscriptions.listId, listId),
                inArray(subscriptions.contactId, unique)
              )
            )
            .pipe(Effect.orDie);

          const onList = new Set(existing.map((row) => row.contactId));
          const toAdd = unique.filter((id) => !onList.has(id));

          const ids = yield* Effect.all(
            toAdd.map(() => withRandom(newSubscriptionId))
          );

          const added =
            toAdd.length === 0
              ? []
              : yield* db
                  .insert(subscriptions)
                  .values(
                    toAdd.map((contactId, index) => ({
                      contactId,
                      id: ids[index] ?? "",
                      listId,
                      organizationId: organization,
                      status: "subscribed",
                    }))
                  )
                  .onConflictDoNothing({
                    target: [subscriptions.listId, subscriptions.contactId],
                  })
                  .returning({ id: subscriptions.id })
                  .pipe(Effect.orDie);

          const withStatus = (status: string) =>
            existing.filter((row) => row.status === status).length;

          return yield* decodeAddedToList({
            added: added.length,
            alreadySubscribed: withStatus("subscribed"),
            leftPending: withStatus("pending"),
            leftUnsubscribed: withStatus("unsubscribed"),
          }).pipe(Effect.orDie);
        }),

      all: Effect.gen(function* allLists() {
        const organization = (yield* CurrentOrganization).id;
        const rows = yield* listsWithCounts(organization);

        return yield* decodeLists(rows.map(toList));
      }).pipe(Effect.orDie),

      create: (name) =>
        Effect.gen(function* createList() {
          const organization = (yield* CurrentOrganization).id;
          const id = yield* withRandom(newListId);

          const [created] = yield* db
            .insert(lists)
            .values({ id, name, organizationId: organization })
            .returning({ createdAt: lists.createdAt });

          return yield* decodeList(
            toList({
              createdAt: created?.createdAt ?? new Date(Number.NaN),
              id,
              name,
              pending: 0,
              subscribed: 0,
              unsubscribed: 0,
            })
          );
        }).pipe(Effect.orDie),

      get: (id) =>
        Effect.gen(function* getList() {
          const organization = (yield* CurrentOrganization).id;
          const [row] = yield* listsWithCounts(organization, id);

          if (row === undefined) {
            return yield* new ListNotFound();
          }

          return yield* decodeList(toList(row)).pipe(Effect.orDie);
        }),
    };
  })
);
