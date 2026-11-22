import type { UserId } from "@repo/domain";
import { Context } from "effect";

/** The signed-in person making this request. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: UserId }
>()("@repo/core/CurrentUser") {}
