import type { OrganizationId } from "@repo/domain";
import { Context } from "effect";

/**
 * The Organization this work acts in. Every repository method for an
 * Organization's data requires it, so no query for tenant data runs without
 * one (ADR 0007). Only `asMemberOf` provides it for a request, after checking
 * membership, and only `asQueuedFor` for a queue message the app sent itself
 * (ADR 0014).
 */
export class CurrentOrganization extends Context.Service<
  CurrentOrganization,
  { readonly id: OrganizationId }
>()("@repo/core/CurrentOrganization") {}
