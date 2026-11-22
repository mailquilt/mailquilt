import type { OrganizationId, Role } from "@repo/domain";
import { Context } from "effect";

/**
 * The Organization this request acts in, after its membership was checked.
 * Every repository method for an Organization's data requires it, and only
 * `asMemberOf` provides it, so no query for tenant data runs without one
 * (ADR 0007).
 */
export class CurrentOrganization extends Context.Service<
  CurrentOrganization,
  { readonly id: OrganizationId; readonly role: Role }
>()("@repo/core/CurrentOrganization") {}
