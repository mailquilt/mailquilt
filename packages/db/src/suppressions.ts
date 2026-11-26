import { currentOrganizationId, Suppressions } from "@repo/core";
import type { OrganizationId, SuppressionId } from "@repo/domain";
import {
  newSuppressionId,
  SuppressionNotFound,
  SuppressionNotRemovable,
  SuppressionPage,
  SuppressionsAdded,
} from "@repo/domain";
import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { newestFirstPage } from "./newest-first-page.ts";
import { suppressions } from "./schema.ts";

const decodePage = Schema.decodeUnknownEffect(SuppressionPage);

const decodeAdded = Schema.decodeUnknownEffect(SuppressionsAdded);

const suppressionColumns = {
  createdAt: suppressions.createdAt,
  email: suppressions.email,
  id: suppressions.id,
  reason: suppressions.reason,
};

const inOrganization = (organization: OrganizationId, id: SuppressionId) =>
  and(eq(suppressions.organizationId, organization), eq(suppressions.id, id));

const firstSpellingOfEachAddress = (emails: readonly string[]) => {
  const byLowerCase = new Map<string, string>();

  for (const email of emails) {
    const key = email.toLowerCase();

    if (!byLowerCase.has(key)) {
      byLowerCase.set(key, email);
    }
  }

  return [...byLowerCase.values()];
};

/**
 * An Organization's Suppressions in Postgres. Every query is scoped to the
 * request's `CurrentOrganization`. A failed query is a defect.
 */
export const SuppressionsLive = Layer.effect(
  Suppressions,
  Effect.gen(function* suppressionsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    return {
      add: (emails) =>
        Effect.gen(function* addSuppressions() {
          const organization = yield* currentOrganizationId;
          const addresses = firstSpellingOfEachAddress(emails);

          const ids = yield* Effect.all(
            addresses.map(() => newSuppressionId)
          ).pipe(Effect.provideService(SecureRandom.SecureRandom, random));

          const added = yield* db
            .insert(suppressions)
            .values(
              addresses.map((email, index) => ({
                email,
                id: ids[index] ?? "",
                organizationId: organization,
                reason: "manual",
              }))
            )
            .onConflictDoNothing()
            .returning({ id: suppressions.id });

          return yield* decodeAdded({
            added: added.length,
            alreadySuppressed: addresses.length - added.length,
          });
        }).pipe(Effect.orDie),

      page: (filter) =>
        db
          .transaction(
            () =>
              Effect.gen(function* suppressionPage() {
                const organization = yield* currentOrganizationId;

                const { items, ...page } = yield* newestFirstPage(db, {
                  cursor: filter,
                  id: suppressions.id,
                  scope: eq(suppressions.organizationId, organization),
                  rows: (where, order, limit) =>
                    db
                      .select(suppressionColumns)
                      .from(suppressions)
                      .where(where)
                      .orderBy(order)
                      .limit(limit),
                  table: suppressions,
                });

                return yield* decodePage({
                  ...page,
                  suppressions: items.map((row) => ({
                    ...row,
                    createdAt: DateTime.fromDateUnsafe(row.createdAt),
                  })),
                }).pipe(Effect.orDie);
              }),
            { accessMode: "read only", isolationLevel: "repeatable read" }
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),

      remove: (id) =>
        Effect.gen(function* removeSuppression() {
          const organization = yield* currentOrganizationId;

          const removed = yield* db
            .delete(suppressions)
            .where(
              and(
                inOrganization(organization, id),
                eq(suppressions.reason, "manual")
              )
            )
            .returning({ id: suppressions.id })
            .pipe(Effect.orDie);

          if (removed.length > 0) {
            return;
          }

          const [kept] = yield* db
            .select({ id: suppressions.id })
            .from(suppressions)
            .where(inOrganization(organization, id))
            .pipe(Effect.orDie);

          return yield* kept === undefined
            ? new SuppressionNotFound()
            : new SuppressionNotRemovable();
        }),
    };
  })
);
