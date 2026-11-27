import { currentOrganizationId, SendingDomains } from "@repo/core";
import type { OrganizationId, SendingDomainId } from "@repo/domain";
import {
  newSendingDomainId,
  SendingDomain,
  SendingDomainAlreadyExists,
  SendingDomainCheck,
  SendingDomainNotFound,
} from "@repo/domain";
import { and, asc, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Option, pipe, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { sendingDomains } from "./schema.ts";

const CheckJson = Schema.toCodecJson(SendingDomainCheck);

const encodeCheck = Schema.encodeEffect(CheckJson);

const decodeCheck = Schema.decodeUnknownEffect(CheckJson);

const decodeSendingDomain = Schema.decodeUnknownEffect(SendingDomain);

type SendingDomainRow = typeof sendingDomains.$inferSelect;

const toSendingDomain = (row: SendingDomainRow) =>
  Effect.gen(function* toDomain() {
    return yield* decodeSendingDomain({
      check: row.lastCheck === null ? null : yield* decodeCheck(row.lastCheck),
      createdAt: DateTime.fromDateUnsafe(row.createdAt),
      dkimSelectors: row.dkimSelectors,
      domain: row.domain,
      id: row.id,
      returnPath: row.returnPath,
    });
  }).pipe(Effect.orDie);

const onlySendingDomain = (rows: readonly SendingDomainRow[]) => {
  const [row] = rows;

  return row === undefined
    ? Effect.fail(new SendingDomainNotFound())
    : toSendingDomain(row);
};

const inOrganization = (organization: OrganizationId, id: SendingDomainId) =>
  and(
    eq(sendingDomains.organizationId, organization),
    eq(sendingDomains.id, id)
  );

/**
 * An Organization's Sending Domains in Postgres. Every query is scoped to
 * the request's `CurrentOrganization`. A failed query is a defect.
 */
export const SendingDomainsLive = Layer.effect(
  SendingDomains,
  Effect.gen(function* sendingDomainsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    return {
      create: (domain) =>
        Effect.gen(function* createSendingDomain() {
          const organization = yield* currentOrganizationId;

          const id = yield* newSendingDomainId.pipe(
            Effect.provideService(SecureRandom.SecureRandom, random)
          );

          const [created] = yield* db
            .insert(sendingDomains)
            .values({
              dkimSelectors: [...domain.dkimSelectors],
              domain: domain.domain,
              id,
              organizationId: organization,
              returnPath: domain.returnPath ?? null,
            })
            .onConflictDoNothing()
            .returning()
            .pipe(Effect.orDie);

          if (created === undefined) {
            return yield* new SendingDomainAlreadyExists();
          }

          return yield* toSendingDomain(created);
        }),

      find: (domain) =>
        Effect.gen(function* findSendingDomain() {
          const organization = yield* currentOrganizationId;

          const [row] = yield* db
            .select()
            .from(sendingDomains)
            .where(
              and(
                eq(sendingDomains.organizationId, organization),
                eq(sendingDomains.domain, domain)
              )
            )
            .pipe(Effect.orDie);

          return row === undefined
            ? Option.none()
            : Option.some(yield* toSendingDomain(row));
        }),

      get: (id) =>
        Effect.gen(function* getSendingDomain() {
          const organization = yield* currentOrganizationId;

          return yield* onlySendingDomain(
            yield* db
              .select()
              .from(sendingDomains)
              .where(inOrganization(organization, id))
              .pipe(Effect.orDie)
          );
        }),

      list: () =>
        Effect.gen(function* listSendingDomains() {
          const organization = yield* currentOrganizationId;

          const rows = yield* db
            .select()
            .from(sendingDomains)
            .where(eq(sendingDomains.organizationId, organization))
            .orderBy(asc(sendingDomains.domain))
            .pipe(Effect.orDie);

          return yield* pipe(
            rows,
            Effect.forEach((row) => toSendingDomain(row))
          );
        }),

      remove: (id) =>
        Effect.gen(function* removeSendingDomain() {
          const organization = yield* currentOrganizationId;

          const removed = yield* db
            .delete(sendingDomains)
            .where(inOrganization(organization, id))
            .returning({ id: sendingDomains.id })
            .pipe(Effect.orDie);

          if (removed.length === 0) {
            return yield* new SendingDomainNotFound();
          }
        }),

      saveCheck: (id, check) =>
        Effect.gen(function* saveSendingDomainCheck() {
          const organization = yield* currentOrganizationId;
          const lastCheck = yield* encodeCheck(check).pipe(Effect.orDie);

          return yield* onlySendingDomain(
            yield* db
              .update(sendingDomains)
              .set({ lastCheck })
              .where(inOrganization(organization, id))
              .returning()
              .pipe(Effect.orDie)
          );
        }),
    };
  })
);
