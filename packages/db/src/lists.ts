import { CurrentOrganization, Lists } from "@repo/core";
import type { ListId, OrganizationId } from "@repo/domain";
import {
  Contact,
  ContactNotFound,
  List,
  ListNotFound,
  newListId,
  newSubscriptionId,
  Subscription,
  SubscriptionPage,
} from "@repo/domain";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { Effect, Layer, Option, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { PAGE_SIZE, toPage } from "./page.ts";
import { contacts, lists, subscriptions } from "./schema.ts";

const decodeList = Schema.decodeUnknownEffect(List);

const decodeLists = Schema.decodeUnknownEffect(Schema.Array(List));

const decodeContact = Schema.decodeUnknownEffect(Contact);

const decodeSubscription = Schema.decodeUnknownEffect(Subscription);

const decodeSubscriptionPage = Schema.decodeUnknownEffect(SubscriptionPage);

const subscriptionColumns = {
  contact: { email: contacts.email, id: contacts.id },
  id: subscriptions.id,
  status: subscriptions.status,
};

const listColumns = { id: lists.id, name: lists.name };

/**
 * An Organization's Lists in Postgres. Every query is scoped to the request's
 * `CurrentOrganization`. A failed query is a defect.
 */
export const ListsLive = Layer.effect(
  Lists,
  Effect.gen(function* listsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    const withRandom = Effect.provideService(SecureRandom.SecureRandom, random);

    const findList = (organization: OrganizationId, id: ListId) =>
      db
        .select(listColumns)
        .from(lists)
        .where(and(eq(lists.organizationId, organization), eq(lists.id, id)))
        .pipe(
          Effect.map(([row]) => Option.fromUndefinedOr(row)),
          Effect.orDie
        );

    const requireList = (organization: OrganizationId, id: ListId) =>
      findList(organization, id).pipe(
        Effect.flatMap((list) =>
          Option.isSome(list) ? Effect.void : Effect.fail(new ListNotFound())
        )
      );

    return {
      all: Effect.gen(function* allLists() {
        const organization = yield* CurrentOrganization;

        const rows = yield* db
          .select(listColumns)
          .from(lists)
          .where(eq(lists.organizationId, organization.id))
          .orderBy(asc(lists.createdAt), asc(lists.id));

        return yield* decodeLists(rows);
      }).pipe(Effect.orDie),

      create: (name) =>
        Effect.gen(function* createList() {
          const organization = yield* CurrentOrganization;
          const id = yield* withRandom(newListId);

          yield* db
            .insert(lists)
            .values({ id, name, organizationId: organization.id });

          return yield* decodeList({ id, name });
        }).pipe(Effect.orDie),

      get: (id) =>
        Effect.gen(function* getList() {
          const organization = yield* CurrentOrganization;

          const list = yield* findList(organization.id, id);

          if (Option.isNone(list)) {
            return yield* new ListNotFound();
          }

          return yield* decodeList(list.value).pipe(Effect.orDie);
        }),

      subscribe: (listId, contactId) =>
        Effect.gen(function* subscribe() {
          const organization = yield* CurrentOrganization;

          yield* requireList(organization.id, listId);

          const [contactRow] = yield* db
            .select({ email: contacts.email, id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.organizationId, organization.id),
                eq(contacts.id, contactId)
              )
            )
            .pipe(Effect.orDie);

          if (contactRow === undefined) {
            return yield* new ContactNotFound();
          }

          const contact = yield* decodeContact(contactRow).pipe(Effect.orDie);
          const id = yield* withRandom(newSubscriptionId);

          yield* db
            .insert(subscriptions)
            .values({
              contactId,
              id,
              listId,
              organizationId: organization.id,
              status: "subscribed",
            })
            .onConflictDoNothing({
              target: [subscriptions.listId, subscriptions.contactId],
            })
            .pipe(Effect.orDie);

          const [subscription] = yield* db
            .select({ id: subscriptions.id, status: subscriptions.status })
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.listId, listId),
                eq(subscriptions.contactId, contactId)
              )
            )
            .pipe(Effect.orDie);

          return yield* decodeSubscription({ ...subscription, contact }).pipe(
            Effect.orDie
          );
        }),

      subscriptions: (listId, after) =>
        Effect.gen(function* subscriptionPage() {
          const organization = yield* CurrentOrganization;

          yield* requireList(organization.id, listId);

          const rows = yield* db
            .select(subscriptionColumns)
            .from(subscriptions)
            .innerJoin(
              contacts,
              and(
                eq(contacts.organizationId, subscriptions.organizationId),
                eq(contacts.id, subscriptions.contactId)
              )
            )
            .where(
              and(
                eq(subscriptions.organizationId, organization.id),
                eq(subscriptions.listId, listId),
                after.pipe(
                  Option.map((cursor) => lt(subscriptions.id, cursor)),
                  Option.getOrUndefined
                )
              )
            )
            .orderBy(desc(subscriptions.id))
            .limit(PAGE_SIZE + 1)
            .pipe(Effect.orDie);

          const { items, next } = toPage(rows);

          return yield* decodeSubscriptionPage({
            next,
            subscriptions: items,
          }).pipe(Effect.orDie);
        }),
    };
  })
);
