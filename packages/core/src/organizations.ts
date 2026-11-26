import type { Organization, OrganizationId, Role, UserId } from "@repo/domain";
import { OrganizationNotFound } from "@repo/domain";
import { Context, Effect, Option } from "effect";

import { CurrentMembership } from "./current-membership.ts";
import { CurrentOrganization } from "./current-organization.ts";
import { CurrentUser } from "./current-user.ts";

/** Port: Organizations and who belongs to them. */
export class Organizations extends Context.Service<
  Organizations,
  {
    /** Creates an Organization with `owner` as its first member. */
    readonly create: (
      owner: UserId,
      name: string
    ) => Effect.Effect<Organization>;
    /** Every Organization `user` belongs to, oldest membership first. */
    readonly listFor: (user: UserId) => Effect.Effect<readonly Organization[]>;
    /** `user`'s role in the Organization, if they are a member. */
    readonly roleOf: (
      user: UserId,
      organization: OrganizationId
    ) => Effect.Effect<Option.Option<Role>>;
    /** Saves the postal address every Campaign of the Organization ends with. */
    readonly updatePostalAddress: (
      postalAddress: string
    ) => Effect.Effect<
      Organization,
      never,
      CurrentOrganization | CurrentMembership
    >;
    /** The Organization this request acts in, with the signed-in person's role. */
    readonly current: Effect.Effect<
      Organization,
      never,
      CurrentOrganization | CurrentMembership
    >;
  }
>()("@repo/core/Organizations") {}

/** Creates an Organization owned by the signed-in person. */
export const createOrganization = (name: string) =>
  Effect.gen(function* createOwnedOrganization() {
    const user = yield* CurrentUser;
    const organizations = yield* Organizations;

    return yield* organizations.create(user.id, name);
  });

/** Every Organization the signed-in person belongs to. */
export const listOrganizations = Effect.gen(function* listOwnOrganizations() {
  const user = yield* CurrentUser;
  const organizations = yield* Organizations;

  return yield* organizations.listFor(user.id);
});

/** The Organization this request acts in. */
export const getOrganization = Effect.gen(function* currentOrganization() {
  const organizations = yield* Organizations;

  return yield* organizations.current;
});

/**
 * Runs `effect` in the Organization `organizationId`, if the signed-in person
 * is a member of it. Otherwise it fails as if the Organization didn't exist.
 * This is the only place a request gets `CurrentOrganization` from.
 */
export const asMemberOf =
  (organizationId: OrganizationId) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* asMember() {
      const user = yield* CurrentUser;
      const organizations = yield* Organizations;
      const role = yield* organizations.roleOf(user.id, organizationId);

      if (Option.isNone(role)) {
        return yield* new OrganizationNotFound();
      }

      return yield* effect.pipe(
        Effect.provideService(CurrentOrganization, { id: organizationId }),
        Effect.provideService(CurrentMembership, { role: role.value })
      );
    });

/** Saves the postal address every Campaign of the Organization ends with. */
export const updatePostalAddress = (postalAddress: string) =>
  Effect.gen(function* updateOrganizationPostalAddress() {
    const organizations = yield* Organizations;

    return yield* organizations.updatePostalAddress(postalAddress);
  });
