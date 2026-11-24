import {
  CurrentMembership,
  CurrentOrganization,
  Organizations,
} from "@repo/core";
import {
  newMemberId,
  newOrganizationId,
  Organization,
  RoleSchema,
} from "@repo/domain";
import { and, asc, eq } from "drizzle-orm";
import { Effect, Layer, Option, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

import { Database } from "./database.ts";
import { members, organizations } from "./schema.ts";

const decodeOrganization = Schema.decodeUnknownEffect(Organization);

const decodeRole = Schema.decodeUnknownEffect(RoleSchema);

/**
 * Organizations and their members in Postgres. A failed query is a defect:
 * the request fails with a 500 rather than answering with partial data.
 */
export const OrganizationsLive = Layer.effect(
  Organizations,
  Effect.gen(function* organizationsRepository() {
    const db = yield* Database;
    const random = yield* SecureRandom.SecureRandom;

    const withRandom = Effect.provideService(SecureRandom.SecureRandom, random);

    return {
      create: (owner, name) =>
        db
          .transaction((tx) =>
            Effect.gen(function* createWithOwner() {
              const id = yield* withRandom(newOrganizationId);
              const memberId = yield* withRandom(newMemberId);

              yield* tx.insert(organizations).values({ id, name });
              yield* tx.insert(members).values({
                id: memberId,
                organizationId: id,
                role: "owner",
                userId: owner,
              });

              return yield* decodeOrganization({ id, name, role: "owner" });
            })
          )
          .pipe(Effect.orDie),

      current: Effect.gen(function* currentOrganization() {
        const current = yield* CurrentOrganization;
        const { role } = yield* CurrentMembership;

        const [row] = yield* db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, current.id));

        return yield* decodeOrganization({ ...row, role });
      }).pipe(Effect.orDie),

      listFor: (user) =>
        db
          .select({
            id: organizations.id,
            name: organizations.name,
            role: members.role,
          })
          .from(members)
          .innerJoin(
            organizations,
            eq(organizations.id, members.organizationId)
          )
          .where(eq(members.userId, user))
          .orderBy(asc(members.createdAt), asc(members.id))
          .pipe(
            Effect.flatMap(Effect.forEach((row) => decodeOrganization(row))),
            Effect.orDie
          ),

      roleOf: (user, organization) =>
        db
          .select({ role: members.role })
          .from(members)
          .where(
            and(
              eq(members.userId, user),
              eq(members.organizationId, organization)
            )
          )
          .pipe(
            Effect.flatMap(([row]) =>
              row === undefined
                ? Effect.succeed(Option.none())
                : decodeRole(row.role).pipe(Effect.map(Option.some))
            ),
            Effect.orDie
          ),
    };
  })
);
