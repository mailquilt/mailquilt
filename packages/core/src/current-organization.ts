import type { OrganizationId } from "@repo/domain";
import { Context, Effect } from "effect";

/**
 * The Organization this work acts in. Every repository method for an
 * Organization's data requires it, so no query for tenant data runs without one
 * (ADR 0007). Only `asMemberOf` provides it for a request, after checking
 * membership, and only `asQueuedFor` for a queue message the app sent itself
 * (ADR 0014). `@repo/core` exports it as a type only, so another package can't
 * provide it without a cast or `Context.makeUnsafe`.
 */
export class CurrentOrganization extends Context.Service<
  CurrentOrganization,
  { readonly id: OrganizationId }
>()("@repo/core/CurrentOrganization") {}

/** The `CurrentOrganization`'s ID, which repositories scope their queries by. */
export const currentOrganizationId = CurrentOrganization.pipe(
  Effect.map(({ id }) => id)
);
