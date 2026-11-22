import { Contacts, CurrentOrganization } from "@repo/core";
import {
  Contact,
  ContactAlreadyExists,
  ContactPage,
  newContactId,
} from "@repo/domain";
import { and, desc, eq, lt } from "drizzle-orm";
import { Effect, Layer, Option, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { PAGE_SIZE, toPage } from "./page.ts";
import { contacts } from "./schema.ts";

const decodeContact = Schema.decodeUnknownEffect(Contact);

const decodePage = Schema.decodeUnknownEffect(ContactPage);

/**
 * An Organization's Contacts in Postgres. Every query is scoped to the
 * request's `CurrentOrganization`. A failed query is a defect.
 */
export const ContactsLive = Layer.effect(
  Contacts,
  Effect.gen(function* contactsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    return {
      create: (email) =>
        Effect.gen(function* createContact() {
          const organization = yield* CurrentOrganization;

          const id = yield* newContactId.pipe(
            Effect.provideService(SecureRandom.SecureRandom, random)
          );

          const [created] = yield* db
            .insert(contacts)
            .values({ email, id, organizationId: organization.id })
            .onConflictDoNothing()
            .returning({ email: contacts.email, id: contacts.id })
            .pipe(Effect.orDie);

          if (created === undefined) {
            return yield* new ContactAlreadyExists();
          }

          return yield* decodeContact(created).pipe(Effect.orDie);
        }),

      page: (after) =>
        Effect.gen(function* contactPage() {
          const organization = yield* CurrentOrganization;

          const rows = yield* db
            .select({ email: contacts.email, id: contacts.id })
            .from(contacts)
            .where(
              and(
                eq(contacts.organizationId, organization.id),
                after.pipe(
                  Option.map((cursor) => lt(contacts.id, cursor)),
                  Option.getOrUndefined
                )
              )
            )
            .orderBy(desc(contacts.id))
            .limit(PAGE_SIZE + 1);

          const { items, next } = toPage(rows);

          return yield* decodePage({ contacts: items, next });
        }).pipe(Effect.orDie),
    };
  })
);
