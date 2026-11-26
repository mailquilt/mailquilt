import type { Role } from "@repo/domain";
import { Context, Effect } from "effect";

/**
 * The signed-in person's role in the `CurrentOrganization`, which `asMemberOf`
 * provides with it. `@repo/core` exports it as a type only, so another package
 * can't provide it without a cast or `Context.makeUnsafe`.
 */
export class CurrentMembership extends Context.Service<
  CurrentMembership,
  { readonly role: Role }
>()("@repo/core/CurrentMembership") {}

/** The signed-in person's role in the `CurrentOrganization`. */
export const currentRole = CurrentMembership.pipe(
  Effect.map(({ role }) => role)
);
