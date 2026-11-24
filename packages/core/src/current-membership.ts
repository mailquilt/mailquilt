import type { Role } from "@repo/domain";
import { Context } from "effect";

/** The signed-in person's role in the `CurrentOrganization`, which `asMemberOf` provides with it. */
export class CurrentMembership extends Context.Service<
  CurrentMembership,
  { readonly role: Role }
>()("@repo/core/CurrentMembership") {}
